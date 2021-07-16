/*
cocalc-kubernetes support.


TODO/CRITICAL: I deleted this from target.ts, so be sure to make this.host be actually right!

  if (project._kubernetes) {
    // this is ugly -- need to determine host in case of kubernetes, since
    // host as set in the project object is old/wrong.
    const status = await callback2(project.status);
    if (!status.ip) {
      throw Error("must wait for project to start");
    }
    host = status.ip;
  }



*/

import {
  BaseProject,
  CopyOptions,
  ProjectStatus,
  ProjectState,
  getProject,
} from "./base";

import getLogger from "smc-hub/logger";
const winston = getLogger("project-control-kubernetes");

class Project extends BaseProject {
  async state(opts: {
    force?: boolean;
    update?: boolean;
  }): Promise<ProjectState> {
    console.log("state", opts);
    throw Error("implement me");
  }

  async status(): Promise<ProjectStatus> {
    winston.debug("status ", this.project_id);
    throw Error("implement me");
  }

  async start(): Promise<void> {
    winston.debug("start ", this.project_id);
    throw Error("implement me");
  }

  async stop(): Promise<void> {
    winston.debug("stop ", this.project_id);
    throw Error("implement me");
  }

  async doCopyPath(opts: CopyOptions) {
    winston.debug("doCopyPath ", this.project_id, opts);
    throw Error("implement me");
  }

  async directoryListing(opts: {
    path?: string;
    hidden?: boolean;
    time?: number;
    start?: number;
    limit?: number;
  }): Promise<any> {
    winston.debug("directoryListing ", this.project_id, opts);
    throw Error("implement me");
  }

  async doReadFile(opts: { path: string; maxsize: number }): Promise<Buffer> {
    winston.debug("doReadFile ", this.project_id, opts);
    throw Error("implement me");
  }
}

export default async function get(project_id: string): Promise<Project> {
  const P: Project = getProject(project_id) ?? new Project(project_id);
  await P.waitUntilReady();
  return P;
}