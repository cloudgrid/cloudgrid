{{- define "cloudgrid.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "cloudgrid.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name (include "cloudgrid.name" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "cloudgrid.labels" -}}
app.kubernetes.io/name: {{ include "cloudgrid.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/part-of: cloudgrid
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version | replace "+" "_" }}
{{- end -}}

{{- define "cloudgrid.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "cloudgrid.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{- define "cloudgrid.image" -}}
{{- $root := index . "root" -}}
{{- $image := index . "image" -}}
{{- $registry := trimSuffix "/" $root.Values.global.imageRegistry -}}
{{- $repository := $image.repository -}}
{{- if and $registry (not (contains "/" $repository)) -}}
{{- $repository = printf "%s/%s" $registry $repository -}}
{{- end -}}
{{- if $image.digest -}}
{{- printf "%s@%s" $repository $image.digest -}}
{{- else -}}
{{- printf "%s:%s" $repository (default $root.Chart.AppVersion $image.tag) -}}
{{- end -}}
{{- end -}}

{{- define "cloudgrid.natsUrl" -}}
{{- if .Values.nats.bundled.enabled -}}
{{- printf "nats://%s-nats:%v" (include "cloudgrid.fullname" .) .Values.nats.service.port -}}
{{- else -}}
{{- required "nats.external.url is required when bundled NATS is disabled" .Values.nats.external.url -}}
{{- end -}}
{{- end -}}

{{- define "cloudgrid.surrealdbUrl" -}}
{{- if .Values.surrealdb.bundled.enabled -}}
{{- printf "http://%s-surrealdb:%v/rpc" (include "cloudgrid.fullname" .) .Values.surrealdb.service.port -}}
{{- else -}}
{{- required "surrealdb.external.url is required when bundled SurrealDB is disabled" .Values.surrealdb.external.url -}}
{{- end -}}
{{- end -}}

{{- define "cloudgrid.surrealdbSecretName" -}}
{{- if .Values.surrealdb.bundled.enabled -}}
{{- printf "%s-surrealdb" (include "cloudgrid.fullname" .) -}}
{{- else -}}
{{- required "surrealdb.external.existingSecret is required when bundled SurrealDB is disabled" .Values.surrealdb.external.existingSecret -}}
{{- end -}}
{{- end -}}

{{- define "cloudgrid.env.common" -}}
- name: CLOUDGRID_DEPLOYMENT_MODE
  value: {{ .Values.deploymentMode | quote }}
- name: CLOUDGRID_AUTH_MODE
  value: {{ .Values.authMode | quote }}
- name: CLOUDGRID_NATS_URL
  value: {{ include "cloudgrid.natsUrl" . | quote }}
{{- end -}}

{{- define "cloudgrid.env.collectorAuth" -}}
{{- if eq .Values.authMode "sso" }}
- name: CLOUDGRID_AUTH_ISSUER
  value: {{ required "otlpCollector.serviceTokenAuth.issuer is required when authMode=sso" .Values.otlpCollector.serviceTokenAuth.issuer | quote }}
- name: CLOUDGRID_AUTH_AUDIENCE
  value: {{ required "otlpCollector.serviceTokenAuth.audience is required when authMode=sso" .Values.otlpCollector.serviceTokenAuth.audience | quote }}
- name: CLOUDGRID_AUTH_JWKS_URL
  value: {{ required "otlpCollector.serviceTokenAuth.jwksUrl is required when authMode=sso" .Values.otlpCollector.serviceTokenAuth.jwksUrl | quote }}
{{- end }}
{{- end -}}

{{- define "cloudgrid.env.surrealdb" -}}
- name: CLOUDGRID_SURREALDB_URL
  value: {{ include "cloudgrid.surrealdbUrl" . | quote }}
- name: CLOUDGRID_SURREALDB_NAMESPACE
  value: {{ .Values.surrealdb.namespace | quote }}
- name: CLOUDGRID_SURREALDB_DATABASE
  value: {{ .Values.surrealdb.database | quote }}
- name: CLOUDGRID_SURREALDB_USERNAME
  valueFrom:
    secretKeyRef:
      name: {{ include "cloudgrid.surrealdbSecretName" . }}
      key: {{ .Values.surrealdb.external.usernameKey }}
- name: CLOUDGRID_SURREALDB_PASSWORD
  valueFrom:
    secretKeyRef:
      name: {{ include "cloudgrid.surrealdbSecretName" . }}
      key: {{ .Values.surrealdb.external.passwordKey }}
{{- end -}}
