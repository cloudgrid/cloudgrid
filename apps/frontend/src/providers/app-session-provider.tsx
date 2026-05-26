import type { Viewer } from "@cloudgrid/ui-contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useCallback, useContext, useMemo } from "react";
import {
  type ControlPlaneGraphQLClient,
  createControlPlaneGraphQLClient,
} from "../lib/graphql-client";
import {
  createLocalViewer,
  type DeploymentMode,
  deploymentModeFromEnv,
} from "../lib/session-state";

const controlPlaneClient = createControlPlaneGraphQLClient(
  import.meta.env.VITE_CLOUDGRID_GRAPHQL_URL || "/graphql",
);

interface AppSessionContextValue {
  client: ControlPlaneGraphQLClient;
  mode: DeploymentMode;
  viewer: Viewer | null;
  isLoading: boolean;
  isBackendUnavailable: boolean;
  error: unknown;
  createProject: ControlPlaneGraphQLClient["createProject"];
  selectProject: (projectId: string) => Promise<Viewer>;
  refetchViewer: () => Promise<void>;
  logout: () => Promise<void>;
}

const AppSessionContext = createContext<AppSessionContextValue | null>(null);

export function AppSessionProvider({
  children,
  client = controlPlaneClient,
  mode = deploymentModeFromEnv(import.meta.env.VITE_CLOUDGRID_DEPLOYMENT_MODE),
}: {
  children: ReactNode;
  client?: ControlPlaneGraphQLClient;
  mode?: DeploymentMode;
}) {
  const queryClient = useQueryClient();
  const viewerQuery = useQuery({
    queryKey: ["Viewer"],
    queryFn: () => client.getViewer(),
    retry: false,
  });
  const selectProjectMutation = useMutation({
    mutationFn: (projectId: string) => client.selectProject(projectId),
    onSuccess(nextViewer) {
      queryClient.setQueryData(["Viewer"], nextViewer);
      void queryClient.invalidateQueries({
        predicate(query) {
          return (
            Array.isArray(query.queryKey) &&
            typeof query.queryKey[0] === "string" &&
            query.queryKey[0] !== "Viewer"
          );
        },
      });
    },
  });
  const createProjectMutation = useMutation({
    mutationFn: client.createProject,
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: ["Viewer"] });
    },
  });

  const isBackendUnavailable =
    mode === "local" && (viewerQuery.isError || viewerQuery.data === null);
  const viewer = isBackendUnavailable ? createLocalViewer() : (viewerQuery.data ?? null);

  const refetchViewer = useCallback(async () => {
    await viewerQuery.refetch();
  }, [viewerQuery]);

  const logout = useCallback(async () => {
    if (mode === "local") {
      return;
    }
    await fetch("/auth/logout", {
      method: "POST",
    });
    window.location.assign("/login");
  }, [mode]);

  const value = useMemo(
    () => ({
      client,
      mode,
      viewer,
      isLoading: viewerQuery.isLoading,
      isBackendUnavailable,
      error: viewerQuery.error,
      createProject: createProjectMutation.mutateAsync,
      selectProject: (projectId: string) => selectProjectMutation.mutateAsync(projectId),
      refetchViewer,
      logout,
    }),
    [
      client,
      logout,
      mode,
      isBackendUnavailable,
      refetchViewer,
      createProjectMutation.mutateAsync,
      selectProjectMutation.mutateAsync,
      viewer,
      viewerQuery.error,
      viewerQuery.isLoading,
    ],
  );

  return <AppSessionContext.Provider value={value}>{children}</AppSessionContext.Provider>;
}

export function useAppSession() {
  const value = useContext(AppSessionContext);
  if (!value) {
    throw new Error("useAppSession must be used within AppSessionProvider");
  }
  return value;
}
