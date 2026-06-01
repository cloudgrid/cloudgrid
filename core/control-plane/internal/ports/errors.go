package ports

import "errors"

var ErrSecretStoreUnavailable = errors.New("secret store is unavailable")
