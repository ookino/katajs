export type GraphModule = {
  name: string;
  provides: string[];
  requires: string[];
  prefix?: string;
  hasRoutes: boolean;
};

export type GraphEdge = {
  from: string;
  to: string;
  via: string;
};

export type GraphRoute = {
  method: string;
  path: string;
  module: string;
};

export type GraphData = {
  modules: GraphModule[];
  edges: GraphEdge[];
  routes: GraphRoute[];
};

export type ConnectionState =
  | { status: 'connecting' }
  | { status: 'live'; data: GraphData }
  | { status: 'error'; message: string }
  | { status: 'disconnected' };
