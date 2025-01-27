import { number, string } from "knub-command-manager";
import { expect } from "chai";
import { BasePluginType } from "..";
import { typedGuildCommand, typedGlobalCommand } from "./CommandBlueprint";
import { GuildTextableChannel, PrivateChannel, Textable } from "eris";

type AssertEquals<TActual, TExpected> = TActual extends TExpected ? true : false;

describe("typedGuildCommand() helper", () => {
  it("(blueprint)", () => {
    const blueprint = typedGuildCommand({
      trigger: "cmd",
      permission: null,
      signature: {
        foo: string(),
        bar: number(),
      },
      run({ args }) {
        // Test type inference
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const result: AssertEquals<typeof args, { foo: string; bar: number }> = true;
      },
    });

    expect(blueprint.trigger).to.equal("cmd");
    expect(blueprint.signature).to.eql({ foo: string(), bar: number() });
    expect(blueprint.run).to.not.equal(undefined);
  });

  interface CustomPluginType extends BasePluginType {
    state: {
      foo: 5;
    };
  }

  it("<TPluginType>()(blueprint)", () => {
    const blueprint = typedGuildCommand<CustomPluginType>()({
      trigger: "cmd",
      permission: null,
      signature: {
        foo: string(),
        bar: number(),
      },
      run({ args, pluginData }) {
        // Test type inference
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const result: AssertEquals<typeof args, { foo: string; bar: number }> = true;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const result2: AssertEquals<typeof pluginData.state.foo, 5> = true;
      },
    });

    expect(blueprint.trigger).to.equal("cmd");
    expect(blueprint.signature).to.eql({ foo: string(), bar: number() });
    expect(blueprint.run).to.not.equal(undefined);
  });

  it("command message is a guild message", () => {
    typedGuildCommand({
      trigger: "foo",
      permission: null,
      run({ message }) {
        // Make sure message.member cannot be null
        // https://github.com/microsoft/TypeScript/issues/29627#issuecomment-458329399
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const result: null extends typeof message.member ? false : true = true;

        // Make sure message.channel is always a textable guild channel and cannot be a private channel
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const result2: Textable & PrivateChannel extends typeof message.channel
          ? false
          : GuildTextableChannel extends typeof message.channel
          ? true
          : false = true;
      },
    });
  });

  it("args type inference for multiple signatures", () => {
    typedGuildCommand({
      trigger: "cmd",
      permission: null,
      signature: [
        {
          foo: string(),
          bar: number(),
        },
        {
          baz: number(),
        },
      ],
      run({ args }) {
        if (args.foo != null) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const x: number = args.bar; // args.bar cannot be undefined
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const y: undefined = args.baz; // args.baz must be undefined
        }

        if (args.baz != null) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const x: number = args.baz; // args.baz cannot be undefined
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const y: undefined = args.bar; // args.bar must be undefined
        }
      },
    });
  });
});

describe("typedGlobalCommand() helper", () => {
  it("(blueprint)", () => {
    const blueprint = typedGlobalCommand({
      trigger: "cmd",
      permission: null,
      signature: {
        foo: string(),
        bar: number(),
      },
      run({ args }) {
        // Test type inference
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const result: AssertEquals<typeof args, { foo: string; bar: number }> = true;
      },
    });

    expect(blueprint.trigger).to.equal("cmd");
    expect(blueprint.signature).to.eql({ foo: string(), bar: number() });
    expect(blueprint.run).to.not.equal(undefined);
  });

  interface CustomPluginType extends BasePluginType {
    state: {
      foo: 5;
    };
  }

  it("<TPluginType>()(blueprint)", () => {
    const blueprint = typedGlobalCommand<CustomPluginType>()({
      trigger: "cmd",
      permission: null,
      signature: {
        foo: string(),
        bar: number(),
      },
      run({ args, pluginData }) {
        // Test type inference
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const result: AssertEquals<typeof args, { foo: string; bar: number }> = true;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const result2: AssertEquals<typeof pluginData.state.foo, 5> = true;
      },
    });

    expect(blueprint.trigger).to.equal("cmd");
    expect(blueprint.signature).to.eql({ foo: string(), bar: number() });
    expect(blueprint.run).to.not.equal(undefined);
  });

  it("command message is NOT necessarily a guild message", () => {
    typedGlobalCommand({
      trigger: "foo",
      permission: null,
      run({ message }) {
        // If the message is not necessarily a guild message, the member can be null
        // https://github.com/microsoft/TypeScript/issues/29627#issuecomment-458329399
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const result: null extends typeof message.member ? true : false = true;

        // If the message is not necessarily a guild message, the channel can be a private channel
        // as well as a guild channel.
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const result2: Textable & PrivateChannel extends typeof message.channel
          ? GuildTextableChannel extends typeof message.channel
            ? true
            : false
          : false = true;
      },
    });
  });
});
