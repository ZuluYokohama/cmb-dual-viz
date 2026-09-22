#include "llama.h"
#include "metrics.h"
#include <nlohmann/json.hpp>
#include <algorithm>
#include <chrono>
#include <cmath>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

using json = nlohmann::json;
using clock_type = std::chrono::steady_clock;
static double ms(clock_type::time_point start) {
    return std::chrono::duration<double, std::milli>(clock_type::now() - start).count();
}
static void log_stderr(ggml_log_level, const char * text, void *) { std::cerr << text; }

static json generate(llama_model * model, const json & req, int threads, int gpu_layers) {
    const auto begin = clock_type::now();
    const std::string id = req.at("id").get<std::string>();
    const std::string prompt = req.at("prompt").get<std::string>();
    const int limit = req.value("max_tokens", 32);
    const int seed = req.value("seed", 1);
    const float temperature = req.value("temperature", 0.0f);
    const bool observe = req.value("observe", true);
    if (id.empty() || id.size() > 256 || prompt.empty() || prompt.size() > 32768 ||
        limit < 1 || limit > 256 || seed < 0 || !std::isfinite(temperature) || temperature < 0 || temperature > 2) {
        throw std::runtime_error("invalid request bounds");
    }
    if (llama_model_has_encoder(model)) throw std::runtime_error("decoder-only model required");
    const auto * vocab = llama_model_get_vocab(model);
    const char * tmpl = llama_model_chat_template(model, nullptr);
    if (!tmpl) throw std::runtime_error("model has no supported chat template");
    const llama_chat_message message {"user", prompt.c_str()};
    int length = llama_chat_apply_template(tmpl, &message, 1, true, nullptr, 0);
    if (length <= 0 || length > 65536) throw std::runtime_error("unsupported chat template");
    std::vector<char> rendered(length + 1);
    length = llama_chat_apply_template(tmpl, &message, 1, true, rendered.data(), rendered.size());
    if (length <= 0 || length >= static_cast<int>(rendered.size())) throw std::runtime_error("template failed");
    int count = -llama_tokenize(vocab, rendered.data(), length, nullptr, 0, true, true);
    if (count <= 0 || count + limit > 2048) throw std::runtime_error("request exceeds 2048-token context");
    std::vector<llama_token> tokens(count);
    if (llama_tokenize(vocab, rendered.data(), length, tokens.data(), count, true, true) != count)
        throw std::runtime_error("tokenization failed");
    auto params = llama_context_default_params();
    params.n_ctx = 2048;
    params.n_batch = 2048;
    params.n_ubatch = 2048;
    params.n_threads = threads;
    params.n_threads_batch = threads;
    params.embeddings = observe;
    params.pooling_type = LLAMA_POOLING_TYPE_NONE;
    std::unique_ptr<llama_context, decltype(&llama_free)> ctx(llama_init_from_model(model, params), llama_free);
    if (!ctx) throw std::runtime_error("context initialization failed");
    std::unique_ptr<llama_sampler, decltype(&llama_sampler_free)> sampler(
        llama_sampler_chain_init(llama_sampler_chain_default_params()), llama_sampler_free);
    if (temperature == 0) llama_sampler_chain_add(sampler.get(), llama_sampler_init_greedy());
    else {
        llama_sampler_chain_add(sampler.get(), llama_sampler_init_temp(temperature));
        llama_sampler_chain_add(sampler.get(), llama_sampler_init_dist(seed));
    }
    auto batch = llama_batch_get_one(tokens.data(), count);
    // Request only the final prompt position, not every prompt embedding/logit row.
    std::vector<int8_t> output_mask(count, 0);
    output_mask.back() = 1;
    batch.logits = output_mask.data();
    json observations = json::array(), emitted = json::array();
    std::vector<float> previous;
    std::string completion;
    double prefill_ms = 0, decode_ms = 0, observer_ms = 0;
    std::string stop = "limit";
    const int nv = llama_vocab_n_tokens(vocab), dim = llama_model_n_embd_out(model);
    llama_token next = 0;
    for (int step = 0; step < limit; ++step) {
        auto start = clock_type::now();
        if (llama_decode(ctx.get(), batch) != 0) throw std::runtime_error("decode failed");
        if (step == 0) prefill_ms += ms(start); else decode_ms += ms(start);
        json observation;
        if (observe) {
            start = clock_type::now();
            const float * logits = llama_get_logits_ith(ctx.get(), -1);
            const float * embedding = llama_get_embeddings_ith(ctx.get(), -1);
            if (!logits || !embedding || dim <= 0) throw std::runtime_error("required model outputs unavailable");
            const auto confidence = logit_metrics(logits, nv);
            double norm2 = 0, dot = 0, prev2 = 0;
            for (int i = 0; i < dim; ++i) {
                if (!std::isfinite(embedding[i])) throw std::runtime_error("nonfinite embedding");
                norm2 += double(embedding[i]) * embedding[i];
                if (!previous.empty()) {
                    dot += double(embedding[i]) * previous[i];
                    prev2 += double(previous[i]) * previous[i];
                }
            }
            json drift = nullptr;
            if (prev2 > 0 && norm2 > 0) drift = 1 - std::clamp(dot / std::sqrt(norm2 * prev2), -1.0, 1.0);
            previous.assign(embedding, embedding + dim);
            observation = {{"step", step}, {"entropy_nats", confidence.entropy},
                {"logit_margin", confidence.margin}, {"embedding_norm", std::sqrt(norm2)},
                {"cosine_drift", drift}, {"embedding", previous}};
            observer_ms += ms(start);
        }
        next = llama_sampler_sample(sampler.get(), ctx.get(), -1);
        const bool eog = llama_vocab_is_eog(vocab, next);
        if (observe) {
            observation["token_id"] = next;
            observation["emitted"] = !eog;
            observations.push_back(std::move(observation));
        }
        if (eog) { stop = "eog"; break; }
        emitted.push_back(next);
        std::vector<char> piece(128);
        int size = llama_token_to_piece(vocab, next, piece.data(), piece.size(), 0, false);
        if (size < 0) {
            piece.resize(-size);
            size = llama_token_to_piece(vocab, next, piece.data(), piece.size(), 0, false);
        }
        if (size < 0) throw std::runtime_error("token rendering failed");
        completion.append(piece.data(), size);
        batch = llama_batch_get_one(&next, 1);
    }
    return {{"schema", "cmb.llm-observation/v1"}, {"id", id}, {"llama_revision", CMB_LLAMA_REV},
        {"feature_revision", "final-output-v1"}, {"observe", observe}, {"prompt_tokens", count},
        {"rendered_prompt", std::string(rendered.data(), length)}, {"vocab_size", nv}, {"embedding_dim", dim},
        {"seed", seed}, {"temperature", temperature}, {"max_tokens", limit}, {"threads", threads},
        {"gpu_layers_requested", gpu_layers}, {"token_ids", emitted}, {"completion", completion},
        {"stop", stop}, {"observations", observations}, {"prefill_ms", prefill_ms}, {"decode_ms", decode_ms},
        {"observer_ms", observer_ms}, {"native_total_ms", ms(begin)}};
}

int main(int argc, char ** argv) {
    try {
        if (argc < 2 || argc > 4) throw std::runtime_error("usage: cmb-llama-observer MODEL.gguf [threads=4] [gpu_layers=0]");
        int threads = argc > 2 ? std::stoi(argv[2]) : 4;
        int gpu_layers = argc > 3 ? std::stoi(argv[3]) : 0;
        if (threads < 1 || threads > 256 || gpu_layers < 0 || gpu_layers > 999) throw std::runtime_error("invalid runtime bounds");
        llama_log_set(log_stderr, nullptr);
        llama_backend_init();
        ggml_backend_load_all();
        auto params = llama_model_default_params();
        params.n_gpu_layers = gpu_layers;
        std::unique_ptr<llama_model, decltype(&llama_model_free)> model(llama_model_load_from_file(argv[1], params), llama_model_free);
        if (!model) throw std::runtime_error("model initialization failed");
        std::string line;
        while (std::getline(std::cin, line)) {
            if (line.size() > 131072) throw std::runtime_error("request exceeds byte limit");
            auto result = generate(model.get(), json::parse(line), threads, gpu_layers);
            std::cout << result.dump(-1, ' ', false, json::error_handler_t::replace) << std::endl;
        }
        model.reset();
        llama_backend_free();
    } catch (const std::exception & error) {
        std::cerr << "cmb observer: " << error.what() << '\n';
        return 1;
    }
}
