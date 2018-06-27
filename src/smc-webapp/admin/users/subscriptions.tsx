import {
  React,
  Component,
  Rendered
} from "smc-webapp/frame-editors/generic/react";

interface Props {
  account_id: string;
}

interface State {
  subscriptions?: any;
}

export class Subscriptions extends Component<Props, State> {
  render(): Rendered {
    return <div>Subscriptions</div>;
  }
}
