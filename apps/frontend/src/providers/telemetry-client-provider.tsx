import { createContext, type ReactNode, useContext } from "react";
import { createTelemetryGraphQLClient, type TelemetryGraphQLClient } from "../lib/graphql-client";

const defaultTelemetryClient = createTelemetryGraphQLClient(
  import.meta.env.VITE_CLOUDGRID_GRAPHQL_URL || "/graphql",
);

const TelemetryClientContext = createContext<TelemetryGraphQLClient>(defaultTelemetryClient);

export function TelemetryClientProvider({
  children,
  client = defaultTelemetryClient,
}: {
  children: ReactNode;
  client?: TelemetryGraphQLClient;
}) {
  return (
    <TelemetryClientContext.Provider value={client}>{children}</TelemetryClientContext.Provider>
  );
}

export function useTelemetryClient() {
  return useContext(TelemetryClientContext);
}
