"use client";

import { LABS } from "@/modules/labs.client";
import type { LabProps } from "@/modules/types";

export function LabHost(props: LabProps) {
  const Lab = LABS[props.moduleId];
  return <Lab {...props} />;
}
