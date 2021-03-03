/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../../app-framework";
import { Configuration } from "./explorer";
import { EXTs as ALL_FILE_BUTTON_TYPES } from "./file-listing/utils";
import { Button } from "antd";
import { Icon, MenuItem, MenuDivider, DropdownMenu } from "../../r_misc";
import { ProjectActions } from "smc-webapp/project_store";
//import { MenuItem, SplitButton } from "react-bootstrap";

interface Props {
  file_search: string;
  current_path: string;
  actions: ProjectActions;
  create_folder: (switch_over?: boolean) => void;
  create_file: (ext?: string, switch_over?: boolean) => void;
  configuration?: Configuration;
  disabled: boolean;
}

export const NewButton: React.FC<Props> = (props: Props) => {
  const {
    file_search = "",
    /*current_path,*/
    actions,
    create_folder,
    create_file,
    configuration,
    disabled,
  } = props;

  function new_file_button_types() {
    if (configuration != undefined) {
      const { disabled_ext } = configuration.get("main", {
        disabled_ext: undefined,
      });
      if (disabled_ext != undefined) {
        return ALL_FILE_BUTTON_TYPES.filter(
          (ext) => !disabled_ext.includes(ext)
        );
      }
    }
    return ALL_FILE_BUTTON_TYPES;
  }

  function file_dropdown_icon(): JSX.Element {
    return (
      <span style={{ whiteSpace: "nowrap" }}>
        <Icon name="plus-circle" /> New
      </span>
    );
  }

  function file_dropdown_item(i: number, ext: string): JSX.Element {
    const { file_options } = require("../../editor");
    const data = file_options("x." + ext);
    return (
      <MenuItem eventKey={i} key={i} onClick={() => choose_extension(ext)}>
        <Icon name={data.icon} />{" "}
        <span style={{ textTransform: "capitalize" }}>{data.name} </span>{" "}
        <span style={{ color: "#666" }}>(.{ext})</span>
      </MenuItem>
    );
  }

  function choose_extension(ext: string): void {
    if (file_search.length === 0) {
      // Tell state to render an error in file search
      actions.ask_filename(ext);
    } else {
      create_file(ext);
    }
  }

  const on_create_folder_button_clicked = (): void => {
    if (file_search.length === 0) {
      actions.ask_filename("/");
    } else {
      create_folder();
    }
  };

  // Go to new file tab if no file is specified
  const on_create_button_clicked = (): void => {
    if (file_search.length === 0) {
      actions.set_active_tab("new");
    } else if (file_search[file_search.length - 1] === "/") {
      create_folder();
    } else {
      create_file();
    }
  };

  return (
    <Button.Group>
      <Button onClick={on_create_button_clicked} disabled={disabled}>
        {file_dropdown_icon()}{" "}
      </Button>

      <DropdownMenu title={""} onClick={on_create_button_clicked} button={true}>
        {new_file_button_types().map((ext, index) =>
          file_dropdown_item(index, ext)
        )}
        <MenuDivider />
        <MenuItem
          eventKey="folder"
          key="folder"
          onSelect={on_create_folder_button_clicked}
        >
          <Icon name="folder" /> Folder
        </MenuItem>
      </DropdownMenu>
    </Button.Group>
  );

  // console.log("ProjectFilesNew configuration", @props.configuration?.toJS())
  // return (
  //   <SplitButton
  //     id={"new_file_dropdown"}
  //     title={file_dropdown_icon()}
  //     onClick={on_create_button_clicked}
  //     disabled={disabled}
  //   >
  //     {new_file_button_types().map((ext, index) =>
  //       file_dropdown_item(index, ext)
  //     )}
  //     <MenuItem divider />
  //     <MenuItem
  //       eventKey="folder"
  //       key="folder"
  //       onSelect={on_create_folder_button_clicked}
  //     >
  //       <Icon name="folder" /> Folder
  //     </MenuItem>
  //   </SplitButton>
  // );
};
