import numpy as np
from sklearn.base import BaseEstimator, TransformerMixin


class QuantileClipper(BaseEstimator, TransformerMixin):
    def fit(self, features: np.ndarray, labels: np.ndarray | None = None) -> "QuantileClipper":
        del labels
        self.lower_bounds_ = np.quantile(features, 0.01, axis=0)
        self.upper_bounds_ = np.quantile(features, 0.99, axis=0)
        return self

    def transform(self, features: np.ndarray) -> np.ndarray:
        return np.clip(features, self.lower_bounds_, self.upper_bounds_)
