/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/* Purchasing a license */

import {
  Button,
  Card,
  Checkbox,
  DatePicker,
  InputNumber,
  Menu,
  Dropdown,
  Row,
  Col,
} from "antd";
import { DownOutlined } from "@ant-design/icons";

import * as moment from "moment";
import { webapp_client } from "../../webapp-client";
import { CSS, React, redux, useMemo, useState } from "../../app-framework";
const { RangePicker } = DatePicker;
import { A, ErrorDisplay, Icon, Space } from "../../r_misc";
import { PurchaseMethod } from "./purchase-method";
import { RadioGroup } from "./radio-group";
import { plural } from "smc-util/misc2";

const LENGTH_PRESETS = [
  { label: "1 Day", desc: { n: 1, key: "days" } },
  { label: "1 Week", desc: { n: 7, key: "days" } },
  { label: "1 Month", desc: { n: 1, key: "months" } },
  { label: "6 Weeks", desc: { n: 7 * 6, key: "days" } },
  { label: "2 Months", desc: { n: 2, key: "months" } },
  { label: "3 Months", desc: { n: 3, key: "months" } },
  { label: "4 Months", desc: { n: 4, key: "months" } },
  { label: "5 Months", desc: { n: 5, key: "months" } },
  { label: "6 Months", desc: { n: 6, key: "months" } },
  { label: "7 Months", desc: { n: 7, key: "months" } },
  { label: "8 Months", desc: { n: 8, key: "months" } },
  { label: "9 Months", desc: { n: 9, key: "months" } },
  { label: "10 Months", desc: { n: 10, key: "months" } },
  { label: "11 Months", desc: { n: 11, key: "months" } },
  { label: "1 Year", desc: { n: 1, key: "years" } },
] as const;

const radioStyle: CSS = {
  display: "block",
  height: "30px",
  lineHeight: "30px",
  fontWeight: "inherit", // this is to undo what react-bootstrap does to the labels.
} as const;

import {
  User,
  Upgrade,
  Subscription,
  PurchaseInfo,
  COSTS,
  GCE_COSTS,
  compute_cost,
  money,
  percent_discount,
} from "./util";

interface Props {
  onClose: () => void;
}

export const PurchaseOneLicense: React.FC<Props> = React.memo(({ onClose }) => {
  const [user, set_user] = useState<User | undefined>(undefined);
  const [upgrade, set_upgrade] = useState<Upgrade>("standard");

  const [custom_ram, set_custom_ram] = useState<number>(COSTS.basic.ram);
  const [custom_cpu, set_custom_cpu] = useState<number>(COSTS.basic.cpu);
  const [custom_disk, set_custom_disk] = useState<number>(COSTS.basic.disk);
  const [custom_always_running, set_custom_always_running] = useState<boolean>(
    !!COSTS.basic.always_running
  );
  const [custom_member, set_custom_member] = useState<boolean>(
    !!COSTS.basic.member
  );
  const [quantity, set_quantity] = useState<number>(1);
  const [subscription, set_subscription] = useState<Subscription>("monthly");

  const [start, set_start_state] = useState<Date>(new Date());
  function set_start(date: Date) {
    set_start_state(date < start ? new Date() : date);
  }

  const [end, set_end_state] = useState<Date>(
    moment().add(1, "month").toDate()
  );
  function set_end(date: Date) {
    const next_day = moment(start).add(1, "day").toDate();
    const two_years = moment(start).add(2, "year").toDate();
    if (date <= next_day) {
      date = next_day;
    } else if (date >= two_years) {
      date = two_years;
    }
    set_end_state(date);
  }

  const [quote, set_quote] = useState<boolean | undefined>(undefined);
  const [quote_info, set_quote_info] = useState<string | undefined>(undefined);
  const [error, set_error] = useState<string>("");
  const [sending, set_sending] = useState<
    undefined | "active" | "success" | "failed"
  >(undefined);
  const [purchase_resp, set_purchase_resp] = useState<string | undefined>(
    undefined
  );
  const disabled: boolean = useMemo(() => {
    return sending == "success" || sending == "active";
  }, [sending]);
  const [payment_method, set_payment_method] = useState<string | undefined>(
    undefined
  );

  const cost = useMemo<
    | {
        cost: number;
        cost_per_project_per_month: number;
        discounted_cost: number;
      }
    | undefined
  >(() => {
    if (
      upgrade == null ||
      user == null ||
      quantity == null ||
      subscription == null
    ) {
      return undefined;
    }
    return compute_cost({
      quantity,
      user,
      upgrade,
      subscription,
      start,
      end,
      custom_ram,
      custom_cpu,
      custom_disk,
      custom_always_running,
      custom_member,
    });
  }, [
    quantity,
    user,
    upgrade,
    subscription,
    start,
    end,
    custom_ram,
    custom_cpu,
    custom_disk,
    custom_always_running,
    custom_member,
  ]);

  const cost_per_project_per_month = useMemo<{
    basic: number;
    standard: number;
    max: number;
  }>(() => {
    const x = {
      basic: 0,
      standard: 0,
      max: 0,
    };
    if (upgrade == null || user == null || quantity == null) {
      return x;
    }
    for (const upgrade in x) {
      x[upgrade] = compute_cost({
        quantity,
        user,
        upgrade: upgrade as Upgrade,
        subscription,
        start,
        end,
        custom_ram,
        custom_cpu,
        custom_disk,
        custom_always_running,
        custom_member,
      }).cost_per_project_per_month;
    }
    return x;
  }, [quantity, user, upgrade, subscription]);

  function render_error() {
    if (error == "") return;
    return <ErrorDisplay error={error} onClose={() => set_error("")} />;
  }

  function render_user() {
    return (
      <div>
        <h4>
          <Icon name="percentage" /> Discount
        </h4>
        <RadioGroup
          options={[
            {
              label: "Academic",
              desc: `students, teachers, academic researchers and hobbyists (${Math.round(
                (1 - COSTS.user_discount["academic"]) * 100
              )}% discount)`,
              value: "academic",
              icon: "graduation-cap",
            },
            {
              label: "Commercial",
              desc: "for business purposes",
              value: "business",
              icon: "briefcase",
            },
          ]}
          onChange={(e) => set_user(e.target.value)}
          value={user}
          disabled={disabled}
          radioStyle={radioStyle}
        />
      </div>
    );
  }

  function render_project_type() {
    if (user == null || cost == null) return;

    return (
      <div>
        <br />
        <h4><Icon name="laptop"/> Type</h4>
        <RadioGroup
          disabled={disabled}
          options={[
            {
              icon: "battery-1",
              label: "Basic",
              value: "basic",
              desc: `priority support, network access, member hosting, ${COSTS.basic.cpu} CPU cores, ${COSTS.basic.ram}GB RAM, ${COSTS.basic.disk}GB disk space`,
              cost: `${money(
                cost_per_project_per_month.basic
              )}/month per project`,
            },
            {
              icon: "battery-2",
              label: "Standard",
              value: "standard",
              desc: `priority support, network access, member hosting, ${COSTS.standard.cpu} CPU cores, ${COSTS.standard.ram}GB RAM, ${COSTS.standard.disk}GB disk space`,
              cost: `${money(
                cost_per_project_per_month.standard
              )}/month per project`,
            },
            {
              icon: "battery-4",
              label: "Max",
              value: "max",
              desc: `priority support, network access, member hosting, ${COSTS.max.cpu} CPU cores, ${COSTS.max.ram}GB RAM, ${COSTS.max.disk}GB disk space`,
              cost: `${money(
                cost_per_project_per_month.max
              )}/month per project`,
            },
            {
              icon: "battery-3",
              label: "Custom",
              value: "custom",
              cost:
                upgrade == "custom"
                  ? `${money(
                      cost.cost_per_project_per_month
                    )}/month per project`
                  : undefined,
            },
          ]}
          onChange={(e) => set_upgrade(e.target.value)}
          value={upgrade}
          radioStyle={radioStyle}
        />
        {upgrade == "custom" && render_custom()}
      </div>
    );
  }

  function render_explanation(s): JSX.Element {
    return (
      <span style={{ color: "#888" }}>
        <Space /> - {s}
      </span>
    );
  }

  function render_custom() {
    if (user == null) return;
    const col_control = 4;
    const col_desc = 20;
    return (
      <div style={{ marginLeft: "60px" }}>
        <Row>
          <Col md={col_control}>
            <Checkbox checked={true} disabled={true}>
              Support
            </Checkbox>
          </Col>
          <Col md={col_desc}>
            priority support
            {render_explanation(
              "we prioritize your support requests much higher (included with all licensed projects)"
            )}
          </Col>
        </Row>

        <Row>
          <Col md={col_control}>
            <Checkbox checked={true} disabled={true}>
              Network
            </Checkbox>
          </Col>
          <Col md={col_desc}>
            network access
            {render_explanation(
              "your project can connect to the Internet to clone git repositories, download files, send emails, etc.  (included with all licensed projects)"
            )}
          </Col>
        </Row>
        <Row>
          <Col md={col_control}>
            <Checkbox
              checked={custom_member}
              onChange={(e) => set_custom_member(e.target.checked)}
            >
              Member
            </Checkbox>
          </Col>
          <Col md={col_desc}>
            member hosting (multiply RAM/CPU price by {COSTS.custom_cost.member}
            )
            {render_explanation(
              "your project runs on computers with far less other projects"
            )}
          </Col>
        </Row>

        <Row>
          <Col md={col_control}>
            <Checkbox
              checked={custom_always_running}
              onChange={(e) => set_custom_always_running(e.target.checked)}
            >
              Always running
            </Checkbox>
          </Col>
          <Col md={col_desc}>
            Project is always running (multiply RAM/CPU price by{" "}
            {COSTS.custom_cost.always_running * GCE_COSTS.non_pre_factor} for
            member hosting or multiply by {COSTS.custom_cost.always_running}{" "}
            without){" "}
            {render_explanation(
              "your project is always running, so you don't have to wait for it to start, and you can run long computations; otherwise, your project will stop after a while if it is not actively being used." +
                (!custom_member
                  ? " Because member hosting isn't selected, your project will restart at least once daily."
                  : "")
            )}
            . See{" "}
            <A href="https://doc.cocalc.com/project-init.html">
              project init scripts.
            </A>
          </Col>
        </Row>
        <Row>
          <Col md={col_control}>
            <InputNumber
              min={COSTS.basic.cpu}
              max={COSTS.custom_max.cpu}
              value={custom_cpu}
              onChange={(x) => {
                if (typeof x != "number") return;
                set_custom_cpu(Math.round(x));
              }}
            />
            <Space />
            <Button
              disabled={custom_cpu == COSTS.custom_max.cpu}
              onClick={() => set_custom_cpu(COSTS.custom_max.cpu)}
            >
              Max
            </Button>
          </Col>
          <Col md={col_desc}>
            number of CPU cores (
            {`${money(
              COSTS.user_discount[user] * COSTS.custom_cost.cpu
            )}/CPU cores per month`}
            )
            {render_explanation(
              "these are Google cloud vCPU's, which may be shared with other projects (member hosting significantly reduces sharing)"
            )}
          </Col>
        </Row>
        <Row>
          <Col md={col_control}>
            <InputNumber
              min={COSTS.basic.ram}
              max={COSTS.custom_max.ram}
              value={custom_ram}
              onChange={(x) => {
                if (typeof x != "number") return;
                set_custom_ram(Math.round(x));
              }}
            />
            <Space />
            <Button
              disabled={custom_ram == COSTS.custom_max.ram}
              onClick={() => set_custom_ram(COSTS.custom_max.ram)}
            >
              Max
            </Button>
          </Col>
          <Col md={col_desc}>
            GB RAM (
            {`${money(
              COSTS.user_discount[user] * COSTS.custom_cost.ram
            )}/GB per month`}
            ){render_explanation("this RAM may be shared with other users")}
          </Col>
        </Row>
        <Row>
          <Col md={col_control}>
            <InputNumber
              min={COSTS.basic.disk}
              max={COSTS.custom_max.disk}
              value={custom_disk}
              onChange={(x) => {
                if (typeof x != "number") return;
                set_custom_disk(Math.round(x));
              }}
            />
            <Space />
            <Button
              disabled={custom_disk == COSTS.custom_max.disk}
              onClick={() => set_custom_disk(COSTS.custom_max.disk)}
            >
              Max
            </Button>
          </Col>
          <Col md={col_desc}>
            GB Disk Space (
            {`${money(
              COSTS.user_discount[user] * COSTS.custom_cost.disk
            )}/GB per month`}
            )
            {render_explanation(
              "this allows you to store a larger number of files. Snapshots and complete file edit history is included at no additional charge."
            )}
          </Col>
        </Row>
      </div>
    );
  }

  function render_quantity_input() {
    return (
      <InputNumber
        style={{ margin: "0 5px" }}
        disabled={disabled}
        min={1}
        max={1000}
        value={quantity}
        onChange={(x) => {
          if (typeof x != "number") return;
          set_quantity(Math.round(x));
        }}
      />
    );
  }

  function render_quantity() {
    if (user == null) return;
    return (
      <div>
        <br />
        <h4><Icon name="sort-amount-up"/> Quantity</h4>
        <div style={{ fontSize: "12pt", marginLeft: "30px" }}>
          Simultaneously use
          {render_quantity_input()}
          {plural(quantity, "project")} with this license.
          <br />
          You can create multiple projects that use this license, but only{" "}
          {quantity} can be used at once.
        </div>
      </div>
    );
  }

  function render_subscription() {
    if (user == null) return;
    return (
      <div>
        <br />
        <h4><Icon name="calendar-week"/> Period</h4>
        <RadioGroup
          disabled={disabled}
          options={[
            {
              icon: "calendar-alt",
              label: "Monthly subscription",
              value: "monthly",
              desc: `pay once every month (${Math.round(
                (1 - COSTS.sub_discount["monthly"]) * 100
              )}% discount)`,
            },
            {
              icon: "calendar-check",
              label: "Yearly subscription",
              value: "yearly",
              desc: `pay once every year (${Math.round(
                (1 - COSTS.sub_discount["yearly"]) * 100
              )}% discount)`,
            },
            {
              icon: "calendar-times-o",
              label: "Custom",
              desc:
                "pay for a specific period of time (as short as one day and as long as 2 years)",
              value: "no",
            },
          ]}
          onChange={(e) => set_subscription(e.target.value)}
          value={subscription}
          radioStyle={radioStyle}
        />
      </div>
    );
  }

  function set_end_date(x): void {
    set_end(
      moment(start)
        .add(x.n as any, x.key)
        .toDate()
    );
  }

  function render_date() {
    if (
      upgrade == null ||
      user == null ||
      quantity == null ||
      subscription != "no"
    )
      return;
    // range of dates: start date -- end date
    // TODO: use "midnight UTC", or should we just give a
    // day grace period on both ends (?).
    const value = [moment(start), moment(end)];
    const presets: JSX.Element[] = [];
    for (const { label, desc } of LENGTH_PRESETS) {
      presets.push(
        <Menu.Item key={label}>
          <a onClick={() => set_end_date(desc)}>{label}</a>
        </Menu.Item>
      );
    }
    const menu = <Menu>{presets}</Menu>;
    const n = moment(end).diff(moment(start), "days");
    return (
      <div style={{ marginLeft: "60px" }}>
        <br />
        <h5>
          Start and end dates ({n} {plural(n, "day")})
        </h5>
        <RangePicker
          disabled={disabled}
          value={value as any}
          onChange={(value) => {
            if (value == null || value[0] == null || value[1] == null) return;
            set_start(value[0].toDate());
            set_end(value[1].toDate());
          }}
        />
        <Space />
        <Space />
        <Space />
        <Dropdown overlay={menu}>
          <a className="ant-dropdown-link" onClick={(e) => e.preventDefault()}>
            End after... <DownOutlined />
          </a>
        </Dropdown>
      </div>
    );
  }

  function render_cost() {
    if (cost == null) return;

    let desc;
    if (cost.discounted_cost < cost.cost) {
      desc = (
        <>
          <span style={{ textDecoration: "line-through" }}>
            {money(cost.cost)}
          </span>
          {" or "}
          {money(cost.discounted_cost)}
          {subscription != "no" ? " " + subscription : ""}, if you purchase
          online now ({percent_discount(cost.cost, cost.discounted_cost)}% off!)
        </>
      );
    } else {
      desc = `${money(cost.cost)} ${subscription != "no" ? subscription : ""}`;
    }

    return (
      <div style={{ fontSize: "12pt" }}>
        <br />
        <h4><Icon name="money-check"/> Cost: {desc}</h4>
      </div>
    );
  }

  function render_quote() {
    if (cost == null) return;
    return (
      <div>
        <br />
        <h4><Icon name="store"/> Purchase</h4>
        <RadioGroup
          disabled={disabled}
          options={[
            {
              label: "Purchase now",
              desc:
                "purchase online now " +
                (cost.discounted_cost < cost.cost
                  ? `and save ${money(cost.cost - cost.discounted_cost)} ${
                      subscription != "no" ? subscription : ""
                    }`
                  : ""),
              value: false,
            },
            {
              label: "Get a quote",
              desc: `I need a quote, invoice, modified terms, a purchase order, to use PayPal, etc. (${money(
                COSTS.min_quote
              )} minimum)`,
              value: true,
              disabled: cost.cost < COSTS.min_quote,
            },
          ]}
          onChange={(e) => set_quote(e.target.value)}
          value={quote}
          radioStyle={radioStyle}
        />
      </div>
    );
  }

  function render_credit_card() {
    if (quote !== false) return;
    if (payment_method != null) {
      return (
        <div>
          <br />
          <h4><Icon name="credit-card"/> Payment method</h4>
          Use {payment_method}
          <br />
          <Button onClick={() => set_payment_method(undefined)}>
            Change...
          </Button>
        </div>
      );
    } else {
      return (
        <div>
          <br />
          <h4><Icon name="credit-card"/> Select or enter payment method</h4>
          <PurchaseMethod
            onClose={(id) => {
              set_payment_method(id);
            }}
          />
        </div>
      );
    }
  }

  async function submit(): Promise<void> {
    if (
      user == null ||
      upgrade == null ||
      quantity == undefined ||
      subscription == null ||
      quote == null
    )
      return;
    const info: PurchaseInfo = {
      quantity,
      user,
      upgrade,
      subscription,
      start,
      end: subscription == "no" ? end : undefined,
      quote,
      quote_info,
      payment_method,
      cost,
      custom_ram,
      custom_cpu,
      custom_disk,
      custom_always_running,
      custom_member,
    };
    set_sending("active");
    try {
      const resp = await webapp_client.stripe.purchase_license(info);
      set_purchase_resp(resp);
      set_sending("success");
    } catch (err) {
      set_error(err.toString());
      set_sending("failed");
    }
  }

  function render_quote_info() {
    if (quote !== true) return;

    return (
      <div>
        Enter additional information about your quote request:
        <br />
        <textarea
          disabled={disabled}
          style={{ width: "100%" }}
          rows={4}
          value={quote_info}
          onChange={(event) => set_quote_info(event.target.value)}
        />
        <br />
        <Button disabled={disabled} onClick={submit}>
          Please contact me
        </Button>
      </div>
    );
  }

  function render_buy() {
    if (quote !== false) return;
    return (
      <div>
        <br />
        <Button onClick={submit} disabled={disabled || payment_method == null}>
          Complete purchase
        </Button>
      </div>
    );
  }

  function render_sending() {
    switch (sending) {
      case "active":
        return <div>Sending to server...</div>;
      case "success":
        return (
          <div>
            Successfully{" "}
            {quote === true ? "requested quote" : "completed purchase"}
            <br />
            <Button onClick={onClose}>Close</Button>
          </div>
        );
      case "failed":
        if (error) {
          return (
            <div>
              Failed to {quote === true ? "request quote" : "complete purchase"}
              <br />
              You may want to try again later.
              <br />
              <Button onClick={onClose}>Close</Button>
            </div>
          );
        } else return;
    }
  }

  function render_purchase_resp() {
    if (!purchase_resp) return;
    return (
      <div>
        <br />
        {purchase_resp}
      </div>
    );
  }

  // Just cancel everything
  function render_cancel() {
    return (
      <div>
        <Button onClick={onClose}>Cancel</Button>
      </div>
    );
  }

  return (
    <Card
      title={
        <>
          <h3>Buy a license</h3>
          <span style={{ fontWeight: 350 }}>
            Buy licenses or request a quote below.
            If you are planning on making a purchase, but need to test things out first,{" "}
            <a onClick={() => redux.getActions("support").set_show(true)}>
              please request a free trial.
            </a>
          </span>
        </>
      }
      extra={<a onClick={onClose}>close</a>}
    >
      {render_user()}
      {render_quantity()}
      {render_project_type()}
      {render_subscription()}
      {render_date()}
      {render_cost()}
      {render_quote()}
      {render_credit_card()}
      {render_quote_info()}
      {render_buy()}
      {render_error()}
      {render_sending()}
      {render_purchase_resp()}
      <hr />
      <br />
      {render_cancel()}
    </Card>
  );
});