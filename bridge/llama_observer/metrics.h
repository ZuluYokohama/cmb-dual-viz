#pragma once
#include <algorithm>
#include <cmath>
#include <stdexcept>

struct LogitMetrics { double entropy; double margin; };
inline LogitMetrics logit_metrics(const float * logits, int n) {
    if (!logits || n < 2) throw std::runtime_error("invalid logits");
    double largest = -INFINITY, second = -INFINITY, sum = 0, weighted = 0;
    for (int i = 0; i < n; ++i) {
        if (!std::isfinite(logits[i])) throw std::runtime_error("nonfinite logits");
        if (logits[i] > largest) { second = largest; largest = logits[i]; }
        else second = std::max(second, double(logits[i]));
    }
    for (int i = 0; i < n; ++i) {
        double weight = std::exp(double(logits[i]) - largest);
        sum += weight;
        weighted += weight * (double(logits[i]) - largest);
    }
    return {std::max(0.0, std::log(sum) - weighted / sum), largest - second};
}
