import type { ReactNode } from "react";
import { TimeMachine } from "@/components/TimeMachine";
import type { ViewState } from "@/lib/viewState";
import { ViewSettings, type ViewField } from "./ViewSettings";

interface Props {
  count: number;
  index: number;
  playing: boolean;
  streaming: boolean;
  onIndex: (i: number) => void;
  onPlay: (playing: boolean) => void;
  view: ViewState;
  onView: (patch: Partial<ViewState>) => void;
  viewFields?: ViewField[];
  /** Controls at the right end of the transport row, before the view settings. */
  actions?: ReactNode;
  children: ReactNode;
}

/** One step under the microscope: the transport that picks it, then whatever the mode shows for it. */
export function StepInspector({ count, index, playing, streaming, onIndex, onPlay, view, onView, viewFields, actions, children }: Props) {
  return (
    <section className="panel p-4 flex flex-col gap-4">
      <TimeMachine
        count={count}
        index={index}
        playing={playing}
        streaming={streaming}
        onIndex={onIndex}
        onPlay={onPlay}
        trailing={
          <>
            {actions}
            <ViewSettings view={view} onChange={onView} fields={viewFields} />
          </>
        }
      />
      {children}
    </section>
  );
}
