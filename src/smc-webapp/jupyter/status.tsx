/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Kernel display

import { React, useRedux, CSS } from "../app-framework";
import * as immutable from "immutable";
import { Progress, Typography } from "antd";
import { COLORS } from "smc-util/theme";
import { A, Icon, Loading, Tip } from "../r_misc";
import { rpad_html } from "smc-util/misc";
import { closest_kernel_match } from "smc-util/jupyter";
import { Logo } from "./logo";
import { JupyterActions } from "./browser-actions";
import { Usage, AlertLevel, BackendState } from "./types";
import { ALERT_COLS } from "./usage";
import { PROJECT_INFO_TITLE } from "../project/info";

const KERNEL_NAME_STYLE: CSS = {
  margin: "0px 5px",
  display: "block",
  color: COLORS.BS_BLUE_TEXT,
  borderLeft: `1px solid ${COLORS.GRAY}`,
  paddingLeft: "5px",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
} as const;

const KERNEL_USAGE_STYLE: CSS = {
  margin: "0px 5px",
  color: COLORS.GRAY,
  borderRight: `1px solid ${COLORS.GRAY}`,
  paddingRight: "5px",
} as const;

const KERNEL_USAGE_STYLE_SMALL: CSS = {
  height: "5px",
  marginBottom: "4px",
  width: "5em",
} as const;

const KERNEL_USAGE_STYLE_NUM: CSS = { fontFamily: "monospace" } as const;

const KERNEL_ERROR_STYLE: CSS = {
  margin: "5px",
  color: "white",
  padding: "5px",
  backgroundColor: COLORS.ATND_BG_RED_M,
} as const;

const BACKEND_STATE_STYLE: CSS = {
  display: "flex",
  marginRight: "5px",
  color: KERNEL_NAME_STYLE.color,
} as const;

interface KernelProps {
  actions: JupyterActions;
  is_fullscreen?: boolean;
  name: string;
  usage?: Usage;
  expected_cell_runtime: number;
}

export const Kernel: React.FC<KernelProps> = React.memo(
  (props: KernelProps) => {
    const {
      actions,
      is_fullscreen,
      name,
      usage,
      expected_cell_runtime,
    } = props;

    // redux section
    const trust: undefined | boolean = useRedux([name, "trust"]);
    const read_only: undefined | boolean = useRedux([name, "read_only"]);
    const kernel: undefined | string = useRedux([name, "kernel"]);
    const kernels: undefined | immutable.List<any> = useRedux([
      name,
      "kernels",
    ]);
    const project_id: string = useRedux([name, "project_id"]);
    const kernel_info: undefined | immutable.Map<string, any> = useRedux([
      name,
      "kernel_info",
    ]);
    const backend_state: undefined | BackendState = useRedux([
      name,
      "backend_state",
    ]);
    const kernel_state: undefined | string = useRedux([name, "kernel_state"]);

    // render functions start there

    // wrap "Logo" component
    function render_logo() {
      if (project_id == null || kernel == null) {
        return;
      }
      return (
        <div style={{ display: "flex" }} className="pull-right">
          <Logo
            project_id={project_id}
            kernel={kernel}
            kernel_info_known={kernel_info != null}
          />
        </div>
      );
    }

    // this renders the name of the kernel, if known, or a button to change to a similar but known one
    function render_name() {
      let display_name = kernel_info?.get("display_name");
      if (display_name == null && kernel != null && kernels != null) {
        // Definitely an unknown kernel
        const closestKernel = closest_kernel_match(
          kernel,
          kernels as any // TODO
        );
        if (closestKernel == null) {
          return <span style={KERNEL_ERROR_STYLE}>Unknown kernel</span>;
        } else {
          const closestKernelDisplayName = closestKernel.get("display_name");
          const closestKernelName = closestKernel.get("name");
          return (
            <span
              style={KERNEL_ERROR_STYLE}
              onClick={() => actions.set_kernel(closestKernelName)}
            >
              Unknown kernel{" "}
              <span style={{ fontWeight: "bold" }}>{kernel}</span>, click here
              to use {closestKernelDisplayName} instead.
            </span>
          );
        }
      } else {
        // List of known kernels just not loaded yet.
        if (display_name == null) {
          display_name = kernel ?? "No Kernel";
        }
        const style = { ...KERNEL_NAME_STYLE, maxWidth: "8em" };
        return (
          <div
            style={style}
            onClick={() => actions.show_select_kernel("user request")}
          >
            {display_name}
          </div>
        );
      }
    }

    // at the very right, an icon to indicate at a quick glance if the kernel is active or not
    function render_backend_state_icon() {
      if (read_only) {
        return;
      }
      if (backend_state == null) {
        return <Loading />;
      }
      /*
      The backend_states are:
         'init' --> 'ready'  --> 'spawning' --> 'starting' --> 'running'

      When the backend_state is 'running', then the kernel_state is either
          'idle' or 'running'
      */
      let spin = false;
      let name: string | undefined;
      let color: string | undefined;
      switch (backend_state) {
        case "init":
          name = "unlink";
          break;
        case "ready":
          name = "circle-o-notch";
          break;
        case "spawning":
          name = "circle-o-notch";
          spin = true;
          break;
        case "starting":
          name = "circle-o-notch";
          spin = true;
          break;
        case "running":
          switch (kernel_state) {
            case "busy":
              name = "circle";
              color = "#5cb85c";
              break;
            case "idle":
              name = "circle-o";
              break;
            default:
              name = "circle-o";
          }
          break;
      }

      return (
        <div style={BACKEND_STATE_STYLE}>
          <Icon name={name} spin={spin} style={{ color }} />
        </div>
      );
    }

    function render_trust() {
      if (trust) {
        if (!is_fullscreen) return;
        return <div style={{ display: "flex", color: "#888" }}>Trusted</div>;
      } else {
        return (
          <div
            title={"Notebook is not trusted"}
            style={{
              display: "flex",
              background: "#5bc0de",
              color: "white",
              cursor: "pointer",
              padding: "3px",
              borderRadius: "3px",
            }}
            onClick={() => actions.trust_notebook()}
          >
            Not Trusted
          </div>
        );
      }
    }

    function get_kernel_tip(): string {
      if (backend_state === "running") {
        switch (kernel_state) {
          case "busy":
            return "Kernel is busy.";
          case "idle":
            return "Kernel is idle.";
          default:
            return "Kernel will start when you run code.";
        }
      } else {
        return "";
      }
    }

    function get_kernel_name(): JSX.Element {
      if (kernel_info != null) {
        return (
          <div>
            <b>Kernel: </b>
            {kernel_info.get("display_name", "No Kernel")}
          </div>
        );
      } else {
        return <span />;
      }
    }

    // a popover information, containin more in depth details about the kernel
    function render_tip(title: any, body: any) {
      const backend_tip = `Backend is ${backend_state}.`;
      const kernel_tip = get_kernel_tip();

      const usage_tip = (
        <>
          <p>
            This shows this kernel's resource usage. The memory limit is
            determined by the remining "free" memory of this project. Open the "
            {PROJECT_INFO_TITLE}" tab see all activities of this project.
          </p>
          <p>
            <Typography.Text type="secondary">
              Keep in mind that "shared memory" could compete with other
              projects on the same machine and hence you might not be able to
              fully attain it.
            </Typography.Text>
          </p>
          <p>
            <Typography.Text type="secondary">
              You can clear all cpu and memory usage by{" "}
              <em>restarting your kernel</em>. Learn more about{" "}
              <A href={"https://doc.cocalc.com/howto/low-memory.html"}>
                Low Memory
              </A>{" "}
              mitigations.
            </Typography.Text>
          </p>
        </>
      );

      const tip = (
        <span>
          {backend_tip}
          {kernel_tip ? <br /> : undefined}
          {kernel_tip}
          <hr />
          {render_usage_text()}
          {usage_tip}
        </span>
      );
      return (
        <Tip
          title={title}
          tip={tip}
          placement={"bottom"}
          tip_style={{ maxWidth: "450px" }}
        >
          {body}
        </Tip>
      );
    }

    // show progress bar indicators for memory usage and the progress of the current cell (expected time)
    // if not fullscreen, i.e. smaller, pack this into two small bars.
    // the main use case is to communicate to the user if there is a cell that takes extraordinarily long to run,
    // or if the memory usage is eating up almost all of the reminining (shared) memory.

    function render_usage_graphical() {
      // unknown, e.g, not reporting/working or old backend.
      if (usage == null) return;

      const style: CSS = is_fullscreen
        ? { display: "flex" }
        : {
            display: "flex",
            flexFlow: "column",
            marginTop: "-6px",
          };
      const pstyle: CSS = {
        margin: "2px",
        width: "5em",
        position: "relative",
        top: "-1px",
      };
      const usage_style: CSS = is_fullscreen
        ? KERNEL_USAGE_STYLE
        : KERNEL_USAGE_STYLE_SMALL;

      // const status = usage.cpu > 50 ? "active" : undefined
      // const status = usage.cpu_runtime != null ? "active" : undefined;
      // **WARNING**: Including the status icon (which is computed above,
      // and done via status={status} for cpu below), leads to a MASSIVE
      // RENDERING BUG, where the cpu burns at like 50% anytime a Jupyter
      // notebook is being displayed. See
      //      https://github.com/sagemathinc/cocalc/issues/5185
      // This may be a weird conflict between antd and fontawesome icons.

      // we calibrate "100%" at the median – color changes at 2 x timings_q
      const cpu_val = Math.min(
        100,
        100 * (usage.cpu_runtime / expected_cell_runtime)
      );

      return (
        <div style={style}>
          <span style={usage_style}>
            {is_fullscreen && "CPU "}
            <Progress
              style={pstyle}
              showInfo={false}
              percent={cpu_val}
              size="small"
              trailColor="white"
              strokeColor={ALERT_COLS[usage.time_alert]}
            />
          </span>
          <span style={usage_style}>
            {is_fullscreen && "Memory "}
            <Progress
              style={pstyle}
              showInfo={false}
              percent={usage.mem_pct}
              size="small"
              trailColor="white"
              strokeColor={ALERT_COLS[usage.mem_alert]}
            />
          </span>
        </div>
      );
    }

    // helper for render_usage_text
    function usage_text_style_level(level: AlertLevel) {
      // ATTN for text, the high background color is different, with white text
      const style = KERNEL_USAGE_STYLE_NUM;
      switch (level) {
        case "low":
          return { ...style, backgroundColor: ALERT_COLS.low };
        case "mid":
          return { ...style, backgroundColor: ALERT_COLS.mid };
        case "high":
          return {
            ...style,
            backgroundColor: ALERT_COLS.high,
            color: "white",
          };
        case "none":
        default:
          return style;
      }
    }

    // this ends up in the popover tip. it contains the actual values and the same color coded usage levels
    function render_usage_text() {
      if (usage == null) return;
      const cpu_style = usage_text_style_level(usage.cpu_alert);
      const memory_style = usage_text_style_level(usage.mem_alert);
      const time_style = usage_text_style_level(usage.time_alert);
      const { cpu, mem, mem_pct } = usage;
      const cpu_disp = `${rpad_html(cpu, 3)}%`;
      const mem_disp = `${rpad_html(mem, 4)}MB`;
      const round = (val) => val.toFixed(1);
      const time_disp = `${rpad_html(usage.cpu_runtime, 5, round)}s`;
      const mem_pct_disp = `${rpad_html(mem_pct, 3)}%`;
      const style: CSS = { whiteSpace: "nowrap" };
      return (
        <p style={style}>
          <span>
            CPU{" "}
            <span
              className={"cocalc-jupyter-usage-info"}
              style={cpu_style}
              dangerouslySetInnerHTML={{ __html: cpu_disp }}
            />
          </span>
          <span>
            Time:{" "}
            <span
              className={"cocalc-jupyter-usage-info"}
              style={time_style}
              dangerouslySetInnerHTML={{ __html: time_disp }}
            />
          </span>
          <span>
            Memory{" "}
            <span
              className={"cocalc-jupyter-usage-info"}
              style={memory_style}
              dangerouslySetInnerHTML={{ __html: mem_disp }}
            />
            <span
              className={"cocalc-jupyter-usage-info"}
              style={memory_style}
              dangerouslySetInnerHTML={{ __html: mem_pct_disp }}
            />
          </span>
        </p>
      );
    }

    if (kernel == null) {
      return <span />;
    }

    const info = (
      <div
        style={{
          display: "flex",
          flex: "1 0",
          flexDirection: "row",
          flexWrap: "nowrap",
        }}
      >
        {render_usage_graphical()}
        {render_trust()}
        {render_name()}
        {render_backend_state_icon()}
      </div>
    );
    const body = (
      <div
        className="pull-right"
        style={{ color: COLORS.GRAY, cursor: "pointer", marginTop: "7px" }}
      >
        {info}
      </div>
    );
    return (
      <span>
        {render_logo()}
        {render_tip(get_kernel_name(), body)}
      </span>
    );
  }
);
