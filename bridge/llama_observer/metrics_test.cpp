#include "metrics.h"
#include <iostream>
#include <limits>

static void near(double actual, double expected) {
    if (std::abs(actual - expected) > 1e-6) throw std::runtime_error("metric reference mismatch");
}
int main() {
    const float uniform[] = {0, 0, 0, 0};
    near(logit_metrics(uniform, 4).entropy, std::log(4.0));
    near(logit_metrics(uniform, 4).margin, 0);
    const float binary[] = {0, float(std::log(3.0))};
    near(logit_metrics(binary, 2).entropy, -.25 * std::log(.25) - .75 * std::log(.75));
    const float shifted[] = {100, 100 + float(std::log(3.0))};
    if (std::abs(logit_metrics(shifted, 2).entropy - logit_metrics(binary, 2).entropy) > 1e-5) return 1;
    const float extreme[] = {-1000, 1000};
    near(logit_metrics(extreme, 2).entropy, 0);
    near(logit_metrics(extreme, 2).margin, 2000);
    const float invalid[] = {0, std::numeric_limits<float>::quiet_NaN()};
    try { logit_metrics(invalid, 2); return 1; } catch (const std::runtime_error &) {}
    std::cout << "PASS: uniform, analytic binary, shift invariance, extreme logits, nonfinite rejection\n";
}
