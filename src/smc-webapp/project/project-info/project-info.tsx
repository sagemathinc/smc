/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, Rendered, useIsMountedRef, CSS } from "../../app-framework";
import { Col, Row } from "react-bootstrap";
import { basename } from "path";
import { Table, Button, Form, Space as AntdSpace } from "antd";
import { seconds2hms } from "smc-util/misc";
import { Loading, Icon } from "../../r_misc";
import { ProjectActions } from "../../project_actions";
import { project_websocket } from "../../frame-editors/generic/client";
import { Channel } from "../../project/websocket/types";
import {
  ProjectInfo,
  ProjectInfoCmds,
  Processes,
  CoCalcInfo,
} from "smc-project/project-info/types";

// for the Table, derived from "Process"
interface ProcessRow {
  key: string; // pid, used in the Table
  pid: number;
  ppid: number;
  name: string;
  args: string;
  mem: number;
  cpu_tot: number;
  cpu_pct: number;
  cocalc?: CoCalcInfo;
  // pre-computed sum of children
  chldsum?: {
    mem: number;
    cpu_tot: number;
    cpu_pct: number;
  };
  children?: ProcessRow[];
}

interface Props {
  name: string;
  project_id: string;
  actions: ProjectActions;
}

// convert the flat raw data into nested (forest) process rows for the table
// I bet there are better algos, but our usual case is less than 10 procs with little nesting
// we intentionally ignore PID 1 (tini)
function process_tree(
  procs: Processes,
  parentid: number,
  pchildren: string[]
): ProcessRow[] | undefined {
  const data: ProcessRow[] = [];
  Object.values(procs).forEach((proc) => {
    if (proc.ppid == parentid) {
      const key = `${proc.pid}`;
      const children = process_tree(procs, proc.pid, pchildren);
      if (children != null) pchildren.push(key);
      data.push({
        key,
        pid: proc.pid,
        ppid: proc.ppid,
        name: basename(proc.exe),
        args: proc.cmdline.slice(1).join(" "),
        mem: proc.stat.mem.rss,
        cpu_tot: proc.cpu.secs,
        cpu_pct: proc.cpu.pct,
        cocalc: proc.cocalc,
        children,
      });
    }
  });
  return data.length > 0 ? data : undefined;
}

function sum_children_val(proc, index): number {
  if (proc.children == null) return 0;
  return proc.children
    .map((p) => p[index] + sum_children_val(p, index))
    .reduce((a, b) => a + b, 0);
}

// we pre-compute the sums of all children (instead of doing this during each render)
function sum_children(ptree: ProcessRow[]) {
  ptree.forEach((proc) => {
    if (proc.children == null) {
      return { mem: 0, cpu_tot: 0, cpu_pct: 0 };
    } else {
      proc.chldsum = {
        mem: sum_children_val(proc, "mem"),
        cpu_tot: sum_children_val(proc, "cpu_tot"),
        cpu_pct: sum_children_val(proc, "cpu_pct"),
      };
      sum_children(proc.children);
    }
  });
}

// returns a CSS colored style to emphasize high values warnings
function warning(index: string, val: number): CSS {
  const red: CSS = {
    backgroundColor: "#f5222d",
    color: "white",
    fontWeight: "bold",
  };
  const orange: CSS = { backgroundColor: "#ffbb96" };
  switch (index) {
    case "cpu_pct":
      if (val > 0.9) {
        return red;
      } else if (val > 0.5) {
        return orange;
      }
    case "mem":
      if (val > 1000) {
        return red;
      } else if (val > 500) {
        return orange;
      }
  }
  return {};
}

export function ProjectInfo({
  project_id,
  actions: project_actions,
}: Props): JSX.Element {
  const isMountedRef = useIsMountedRef();
  const [info, set_info] = React.useState<Partial<ProjectInfo>>({});
  const [ptree, set_ptree] = React.useState<ProcessRow[] | null>(null);
  const [chan, set_chan] = React.useState<Channel | null>(null);
  const [status, set_status] = React.useState<string>("initializing…");
  const [loading, set_loading] = React.useState<boolean>(true);
  const [selected, set_selected] = React.useState<number[]>([]);
  const [expanded, set_expanded] = React.useState<React.ReactText[]>([]);
  const [have_children, set_have_children] = React.useState<string[]>([]);

  function set_data(data: ProjectInfo) {
    set_info(data);
    const pchildren: string[] = [];
    const new_ptree = process_tree(data.processes, 1, pchildren) ?? [];
    sum_children(new_ptree);
    set_ptree(new_ptree);
    set_have_children(pchildren);
  }

  async function connect() {
    set_status("connecting…");
    const ws = await project_websocket(project_id);
    const chan = await ws.api.project_info();
    if (!isMountedRef.current) return;

    chan.on("data", function (data) {
      if (!isMountedRef.current) return;
      set_loading(false);
      set_status("receiving…");
      set_data(data);
    });

    chan.on("close", async function () {
      if (!isMountedRef.current) return;
      set_status("closed. reconnecting in 1 second…");
      set_chan(null);
      await delay(1000);
      if (!isMountedRef.current) return;
      connect();
    });

    set_chan(chan);
  }

  React.useEffect(() => {
    connect();
    return () => {
      if (!isMountedRef.current) return;
      set_status("connection ended");
      chan?.end();
      set_chan(null);
    };
  }, []);

  function select_proc(pids: number[]) {
    set_selected(pids);
  }

  // if collapsed, we sum up the values of the children
  // to avoid misunderstandings due to data not being shown…
  function render_val(
    index: string,
    to_str: (val) => Rendered | React.ReactText
  ) {
    const cell_val = (val, proc): number => {
      // we have to check for length==0, because initally rows are all expanded but
      // onExpandedRowsChange isn't triggered
      if (
        expanded.length == 0 ||
        expanded.includes(proc.key) ||
        !have_children.includes(proc.key)
      ) {
        return val;
      } else {
        const cs = proc.chldsum;
        return val + (cs != null ? cs[index] : 0);
      }
    };

    return (val: number, proc: ProcessRow) => {
      const display_val = cell_val(val, proc);
      return {
        props: { style: warning(index, display_val) },
        children: to_str(display_val),
      };
    };
  }

  function render_signal(name: string, signal: number) {
    return (
      <Button
        type="primary"
        onClick={() => {
          if (chan == null) return;
          const payload: ProjectInfoCmds = {
            cmd: "kill",
            signal,
            pids: selected,
          };
          chan.write(payload);
          set_selected([]);
        }}
        disabled={chan == null || selected.length == 0}
        loading={loading}
      >
        {name}
      </Button>
    );
  }

  function render_signals() {
    return (
      <Form.Item label="Send signal:">
        <AntdSpace>
          {render_signal("Terminate", 15)}
          {render_signal("Kill", 9)}
        </AntdSpace>
      </Form.Item>
    );
  }

  function has_children(proc: ProcessRow): boolean {
    return proc.children != null && proc.children.length > 0;
  }

  function render_cocalc({ cocalc }: ProcessRow) {
    if (cocalc == null) return;
    switch (cocalc.type) {
      case "terminal":
        return (
          <Button
            shape="round"
            size="small"
            icon={<Icon name={"terminal"} />}
            onClick={() =>
              project_actions.open_file({ path: cocalc.path, foreground: true })
            }
          >
            Open
          </Button>
        );
    }
  }

  // mimic a table of processes program like htop – with tailored descriptions for cocalc
  function render_top() {
    if (ptree == null) return <Loading />;

    const expandable = {
      defaultExpandAllRows: true,
      onExpandedRowsChange: (keys) => set_expanded(keys),
      rowExpandable: (proc) => has_children(proc),
    };

    return (
      <>
        <Form
          layout="inline"
          className="components-table-demo-control-bar"
          style={{ marginBottom: 16 }}
        >
          {render_signals()}
        </Form>

        <Table<ProcessRow>
          dataSource={ptree}
          size="small"
          pagination={false}
          scroll={{ y: "70vh" }}
          expandable={expandable}
          rowSelection={{ selectedRowKeys: selected, onChange: select_proc }}
          loading={loading}
        >
          <Table.Column<ProcessRow>
            key="process"
            title="Process"
            width="60%"
            align={"left"}
            ellipsis={true}
            render={(proc) => (
              <span>
                <b>{proc.name}</b> <span>{proc.args}</span>
              </span>
            )}
          />
          <Table.Column<ProcessRow>
            key="cocalc"
            title="CoCalc"
            width="10%"
            align={"left"}
            render={(proc) => render_cocalc(proc)}
          />
          <Table.Column<ProcessRow>
            key="cpu_pct"
            title="CPU%"
            width="10%"
            dataIndex="cpu_pct"
            align={"right"}
            render={render_val(
              "cpu_pct",
              (val) => `${(100 * val).toFixed(1)}%`
            )}
          />
          <Table.Column<ProcessRow>
            key="cpu_tot"
            title="CPU Time"
            dataIndex="cpu_tot"
            width="10%"
            align={"right"}
            render={render_val("cpu_tot", (val) => seconds2hms(val))}
          />
          <Table.Column<ProcessRow>
            key="mem"
            title="Memory"
            dataIndex="mem"
            width="10%"
            align={"right"}
            render={render_val("mem", (val) => `${val.toFixed(0)}MiB`)}
          />
        </Table>
      </>
    );
  }

  function render() {
    return (
      <Row style={{ marginTop: "15px" }}>
        <Col md={12} mdOffset={0} lg={10} lgOffset={1}>
          <h1>Project Info</h1>
          <div>
            timestamp:{" "}
            {info.timestamp != null ? (
              <code>{new Date(info.timestamp).toISOString()}</code>
            ) : (
              "no timestamp"
            )}{" "}
            | connected: <code>{`${chan != null}`}</code> | status:{" "}
            <code>{status}</code>
          </div>
          {render_top()}
          {false && (
            <pre style={{ fontSize: "10px" }}>
              {JSON.stringify(info.processes, null, 2)}
            </pre>
          )}
        </Col>
      </Row>
    );
  }

  return React.useMemo(render, [
    info,
    ptree,
    status,
    loading,
    selected,
    expanded,
  ]);
}