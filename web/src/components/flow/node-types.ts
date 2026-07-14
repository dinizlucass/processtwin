import { TaskNode } from "@/components/flow/nodes/TaskNode";
import { GatewayNode } from "@/components/flow/nodes/GatewayNode";
import { EventNode } from "@/components/flow/nodes/EventNode";
import { DataNode } from "@/components/flow/nodes/DataNode";
import { AnnotationNode } from "@/components/flow/nodes/AnnotationNode";

export const nodeTypes = {
  start: EventNode,
  end: EventNode,
  intermediate: EventNode,
  task: TaskNode,
  subprocess: TaskNode,
  decision: GatewayNode,
  gateway_parallel: GatewayNode,
  gateway_inclusive: GatewayNode,
  data: DataNode,
  annotation: AnnotationNode,
};
