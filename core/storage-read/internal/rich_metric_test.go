package internal

import (
	"context"
	"testing"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

type fakeMetricSeriesQuerier struct {
	data map[string]contracts.MetricSeriesData
}

func (f fakeMetricSeriesQuerier) QueryMetricSeries(_ context.Context, input contracts.MetricSeriesInput, _ *contracts.AuthContext) (contracts.MetricSeriesData, error) {
	return f.data[input.MetricName], nil
}

func TestQueryRichMetricSeriesEvaluatesFormulasAndDisplayDefaults(t *testing.T) {
	from := time.Date(2026, 5, 18, 10, 0, 0, 0, time.UTC)
	to := from.Add(time.Hour)
	refA := "a"
	refB := "b"
	op := contracts.DashboardMetricFormulaBinaryOperatorDivide
	fn := contracts.DashboardMetricFormulaFunctionRatio
	unit := "percent"

	data, err := QueryRichMetricSeriesFromMetricSeries(context.Background(), fakeMetricSeriesQuerier{data: map[string]contracts.MetricSeriesData{
		"requests": {
			Metric:   contracts.MetricDescriptor{Name: "requests", Unit: "count"},
			Interval: "1m",
			Series: []contracts.MetricSeries{{
				Labels: contracts.Attributes{"service": "api"},
				Points: []contracts.MetricSeriesPoint{
					{Timestamp: from, Value: 8},
					{Timestamp: from.Add(time.Minute), Value: 10},
				},
			}},
		},
		"errors": {
			Metric:   contracts.MetricDescriptor{Name: "errors", Unit: "count"},
			Interval: "1m",
			Series: []contracts.MetricSeries{{
				Labels: contracts.Attributes{"service": "api"},
				Points: []contracts.MetricSeriesPoint{
					{Timestamp: from, Value: 2},
					{Timestamp: from.Add(time.Minute), Value: 5},
				},
			}},
		},
	}}, contracts.RichMetricSeriesInput{
		From: from,
		To:   to,
		Query: contracts.DashboardMetricQueryInput{
			Queries: []contracts.DashboardMetricQueryRowInput{
				{ID: refA, Label: "Requests", MetricName: "requests", Aggregation: contracts.MetricAggregationSum},
				{ID: refB, Label: "Errors", MetricName: "errors", Aggregation: contracts.MetricAggregationSum},
			},
			Formulas: []contracts.DashboardMetricFormulaInput{{
				ID:    "error_rate",
				Label: "Error rate",
				Unit:  &unit,
				Expression: contracts.DashboardMetricFormulaExpressionInput{
					Kind:     contracts.DashboardMetricFormulaExpressionKindFunction,
					Function: &fn,
					Arguments: []contracts.DashboardMetricFormulaExpressionInput{
						{Kind: contracts.DashboardMetricFormulaExpressionKindRef, RefID: &refB},
						{Kind: contracts.DashboardMetricFormulaExpressionKindRef, RefID: &refA},
					},
				},
			}, {
				ID:    "explicit_divide",
				Label: "Explicit divide",
				Expression: contracts.DashboardMetricFormulaExpressionInput{
					Kind:     contracts.DashboardMetricFormulaExpressionKindBinary,
					Operator: &op,
					Left:     &contracts.DashboardMetricFormulaExpressionInput{Kind: contracts.DashboardMetricFormulaExpressionKindRef, RefID: &refB},
					Right:    &contracts.DashboardMetricFormulaExpressionInput{Kind: contracts.DashboardMetricFormulaExpressionKindRef, RefID: &refA},
				},
			}},
		},
	}, nil)
	if err != nil {
		t.Fatalf("QueryRichMetricSeriesFromMetricSeries() error = %v", err)
	}

	if data.Interval != "1m" {
		t.Fatalf("interval = %q, want 1m", data.Interval)
	}
	if len(data.Series) != 4 {
		t.Fatalf("series len = %d, want source and formula series", len(data.Series))
	}
	formula := data.Series[2]
	if formula.ID != "error_rate" || formula.Label != "Error rate" || formula.Unit == nil || *formula.Unit != "percent" {
		t.Fatalf("formula series = %#v", formula)
	}
	if formula.Points[0].Value != 0.25 || formula.Points[1].Value != 0.5 {
		t.Fatalf("formula points = %#v, want ratios", formula.Points)
	}
	if len(data.DisplaySeries) != 4 || !data.DisplaySeries[0].Visible || data.DisplaySeries[2].SourceID != "error_rate" {
		t.Fatalf("display series = %#v", data.DisplaySeries)
	}
}

func TestRichMetricFormulaHandlesScalarsAlignmentAndValidation(t *testing.T) {
	from := time.Date(2026, 5, 18, 10, 0, 0, 0, time.UTC)
	opAdd := contracts.DashboardMetricFormulaBinaryOperatorAdd
	opSubtract := contracts.DashboardMetricFormulaBinaryOperatorSubtract
	opMultiply := contracts.DashboardMetricFormulaBinaryOperatorMultiply
	opDivide := contracts.DashboardMetricFormulaBinaryOperatorDivide
	ref := "series"
	scalar := 2.0

	source := []contracts.RichMetricSeries{{
		Labels: contracts.Attributes{"service": "api"},
		Points: []contracts.MetricSeriesPoint{
			{Timestamp: from, Value: 4},
			{Timestamp: from.Add(time.Minute), Value: 8},
		},
	}, {
		Labels: contracts.Attributes{"service": "worker"},
		Points: []contracts.MetricSeriesPoint{{Timestamp: from, Value: 10}},
	}}
	sources := map[string][]contracts.RichMetricSeries{ref: source}

	for _, item := range []struct {
		name     string
		operator contracts.DashboardMetricFormulaBinaryOperator
		want     float64
	}{
		{"add", opAdd, 6},
		{"subtract", opSubtract, 2},
		{"multiply", opMultiply, 8},
		{"divide", opDivide, 2},
	} {
		t.Run(item.name, func(t *testing.T) {
			series, warnings, err := evaluateRichFormulaExpression(contracts.DashboardMetricFormulaExpressionInput{
				Kind:     contracts.DashboardMetricFormulaExpressionKindBinary,
				Operator: &item.operator,
				Left:     &contracts.DashboardMetricFormulaExpressionInput{Kind: contracts.DashboardMetricFormulaExpressionKindRef, RefID: &ref},
				Right:    &contracts.DashboardMetricFormulaExpressionInput{Kind: contracts.DashboardMetricFormulaExpressionKindNumber, Value: &scalar},
			}, sources)
			if err != nil {
				t.Fatalf("evaluateRichFormulaExpression() error = %v", err)
			}
			if len(warnings) != 0 || len(series) != 2 || series[0].Points[0].Value != item.want {
				t.Fatalf("series=%#v warnings=%#v, want scalar operation", series, warnings)
			}
		})
	}

	zero := 0.0
	series, warnings, err := evaluateRichFormulaExpression(contracts.DashboardMetricFormulaExpressionInput{
		Kind:     contracts.DashboardMetricFormulaExpressionKindBinary,
		Operator: &opDivide,
		Left:     &contracts.DashboardMetricFormulaExpressionInput{Kind: contracts.DashboardMetricFormulaExpressionKindRef, RefID: &ref},
		Right:    &contracts.DashboardMetricFormulaExpressionInput{Kind: contracts.DashboardMetricFormulaExpressionKindNumber, Value: &zero},
	}, sources)
	if err != nil {
		t.Fatalf("divide by zero expression error = %v", err)
	}
	if len(series[0].Points) != 0 || len(warnings) == 0 || warnings[0].Code != "DIVIDE_BY_ZERO" {
		t.Fatalf("divide by zero series=%#v warnings=%#v", series, warnings)
	}

	other := []contracts.RichMetricSeries{{Points: []contracts.MetricSeriesPoint{{Timestamp: from.Add(5 * time.Minute), Value: 1}}}}
	points, pointWarnings := applyBinaryMetricPoints(opAdd, source[0].Points, other[0].Points)
	if len(points) != 0 || len(pointWarnings) == 0 || pointWarnings[0].Code != "POINT_ALIGNMENT" {
		t.Fatalf("points=%#v warnings=%#v, want alignment warnings", points, pointWarnings)
	}

	if validRichMetricBinaryOperator(contracts.DashboardMetricFormulaBinaryOperator("mod")) {
		t.Fatal("mod should not be a valid rich metric operator")
	}
}
