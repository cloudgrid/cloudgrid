package collector

import (
	"io"
	"log/slog"
	"os"
	"strings"
)

const serviceName = "otlp-collector"

func NewLogger(output io.Writer) *slog.Logger {
	return NewLoggerWithLevel(output, runtimeLogLevel())
}

func NewLoggerWithLevel(output io.Writer, level slog.Level) *slog.Logger {
	handler := slog.NewJSONHandler(output, &slog.HandlerOptions{
		Level: level,
		ReplaceAttr: func(_ []string, attr slog.Attr) slog.Attr {
			switch attr.Key {
			case slog.TimeKey:
				attr.Key = "timestamp"
			case slog.MessageKey:
				attr.Key = "message"
			case slog.LevelKey:
				attr.Value = slog.StringValue(strings.ToLower(attr.Value.String()))
			}
			return attr
		},
	})
	return slog.New(handler)
}

func NewDiscardLogger() *slog.Logger {
	return NewLogger(io.Discard)
}

func runtimeLogLevel() slog.Level {
	switch strings.ToLower(strings.TrimSpace(os.Getenv("CLOUDGRID_LOG_LEVEL"))) {
	case "debug":
		return slog.LevelDebug
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}
