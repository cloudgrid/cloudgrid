import { Navigate, Outlet, useLocation } from "react-router-dom";
import { LoadingRows } from "../components/query-state";
import { getTelemetryProjectState } from "../lib/session-state";
import { useAppSession } from "../providers/app-session-provider";

export function TelemetryProjectGate() {
  const { isLoading, viewer } = useAppSession();
  const location = useLocation();

  if (isLoading) {
    return <LoadingRows />;
  }

  const state = getTelemetryProjectState(viewer);

  if (state.kind === "required") {
    return <Navigate replace state={{ from: location.pathname }} to="/projects" />;
  }

  return <Outlet />;
}
