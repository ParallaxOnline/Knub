import { CommandManager, IMatchedCommand, isError } from "knub-command-manager";
import {
  checkCommandCooldown,
  checkCommandLocks,
  checkCommandPermission,
  CommandContext,
  CommandExtraData,
  CommandFn,
  CommandMeta,
  getCommandSignature,
  getDefaultPrefix,
  PluginCommandDefinition,
  restrictCommandSource,
} from "./commandUtils";
import { Client, Message } from "eris";
import { AnyPluginData } from "../plugins/PluginData";
import { CommandBlueprint } from "./CommandBlueprint";

export interface PluginCommandManagerOpts<TCommandContext> {
  prefix?: string | RegExp;
}

/**
 * A module to manage and run commands for a single instance of a plugin
 */
export class PluginCommandManager<TPluginData extends AnyPluginData<any>> {
  private pluginData: TPluginData | undefined;
  private manager: CommandManager<CommandContext<TPluginData>, CommandExtraData<TPluginData>>;
  private handlers: Map<number, CommandFn<TPluginData, any>>;

  constructor(client: Client, opts: PluginCommandManagerOpts<CommandContext<TPluginData>> = {}) {
    this.manager = new CommandManager<CommandContext<TPluginData>, CommandExtraData<TPluginData>>({
      prefix: opts.prefix ?? getDefaultPrefix(client),
    });

    this.handlers = new Map();
  }

  public setPluginData(pluginData: TPluginData) {
    if (this.pluginData) {
      throw new Error("Plugin data already set");
    }

    this.pluginData = pluginData;
  }

  public add(blueprint: CommandBlueprint<TPluginData, any>) {
    const preFilters = Array.from(blueprint.config?.preFilters ?? []);
    preFilters.unshift(restrictCommandSource, checkCommandPermission);

    const postFilters = Array.from(blueprint.config?.postFilters ?? []);
    postFilters.unshift(checkCommandCooldown, checkCommandLocks);

    const config = {
      ...blueprint.config,
      preFilters,
      postFilters,
      extra: {
        blueprint,
      },
    };

    const command = this.manager.add(blueprint.trigger, blueprint.signature, config);
    this.handlers.set(command.id, blueprint.run);
  }

  public remove(id: number) {
    this.manager.remove(id);
    this.handlers.delete(id);
  }

  public getAll(): PluginCommandDefinition[] {
    return this.manager.getAll();
  }

  public async runFromMessage(msg: Message): Promise<void> {
    if (msg.content == null || msg.content.trim() === "") {
      return;
    }

    const command = await this.manager.findMatchingCommand(msg.content, {
      message: msg,
      pluginData: this.pluginData!,
    });

    if (!command) return;

    if (isError(command)) {
      const usageLine = getCommandSignature(command.command);
      msg.channel.createMessage(`${command.error}\nUsage: \`${usageLine}\``);
      return;
    }

    const extraMeta: Partial<CommandMeta<TPluginData, any>> = {};
    if (command.config!.extra?._lock) {
      extraMeta.lock = command.config!.extra._lock;
    }

    await this.runCommand(msg, command, extraMeta);
  }

  private async runCommand(
    msg: Message,
    matchedCommand: IMatchedCommand<CommandContext<TPluginData>, CommandExtraData<TPluginData>>,
    extraMeta?: Partial<CommandMeta<TPluginData, any>>
  ): Promise<void> {
    const handler = this.handlers.get(matchedCommand.id);
    if (!handler) {
      throw new Error(`Command handler for command ${matchedCommand.id} does not exist`);
    }

    const valueMap = Object.entries(matchedCommand.values).reduce((map, [key, matched]) => {
      map[key] = matched.value;
      return map;
    }, {});

    const meta: CommandMeta<TPluginData, any> = {
      ...extraMeta,
      args: valueMap,
      message: msg as any,
      pluginData: this.pluginData!,
      command: matchedCommand,
    };

    await handler(meta);
  }
}
