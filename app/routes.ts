import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("list", "routes/list.tsx"),
  route("hammer-of-wilderwood", "routes/hammer-of-wilderwood.tsx"),
  route("initiative", "routes/initiative.tsx"),
] satisfies RouteConfig;
