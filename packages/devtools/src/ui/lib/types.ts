export type GraphConsumer = {
  queue: string;
  dlq?: string;
};

export type GraphModule = {
  name: string;
  provides: string[];
  requires: string[];
  prefix?: string;
  hasRoutes: boolean;
  consumer?: GraphConsumer;
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

export type GraphProducer = {
  name: string;
  binding: string;
};

export type GraphData = {
  modules: GraphModule[];
  edges: GraphEdge[];
  routes: GraphRoute[];
  producers: GraphProducer[];
};

export type ConnectionState =
  | { status: 'connecting' }
  | { status: 'live'; data: GraphData }
  | { status: 'error'; message: string }
  | { status: 'disconnected' };
