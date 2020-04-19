import {
  CommandManager,
  findMatchingCommandResultHasError,
  IArgumentMap,
  ICommandConfig,
  ICommandDefinition,
  IMatchedOptionMap,
  IParameter
} from "knub-command-manager";
import {
  getCommandSignature,
  getDefaultPrefix,
  ICommandExtraData,
  CommandContext,
  CommandFn,
  CommandBlueprint,
  restrictCommandSource,
  checkCommandPermission,
  checkCommandCooldown,
  checkCommandLocks,
  PluginCommandDefinition,
  CommandMeta
} from "./commandUtils";
// tslint:disable-next-line:no-submodule-imports
import { TTypeConverterFn } from "knub-command-manager/dist/types";
import { baseParameterTypes } from "./baseParameterTypes";
import { Client, Message } from "eris";
import { PluginData } from "./PluginData";

export interface PluginCommandManagerOpts<TContext> {
  prefix?: string | RegExp;
  customArgumentTypes?: {
    [key: string]: TTypeConverterFn<CommandContext>;
  };
}

/**
 * A module to manage and run commands for a single instance of a plugin
 */
export class PluginCommandManager {
  private pluginData: PluginData;
  private manager: CommandManager<CommandContext, ICommandExtraData>;
  private handlers: Map<number, CommandFn>;

  constructor(client: Client, opts: PluginCommandManagerOpts<CommandContext> = {}) {
    this.manager = new CommandManager<CommandContext, ICommandExtraData>({
      prefix: opts.prefix ?? getDefaultPrefix(client),
      types: {
        ...baseParameterTypes,
        ...opts.customArgumentTypes
      }
    });

    this.handlers = new Map();
  }

  public setPluginData(pluginData: PluginData) {
    if (this.pluginData) {
      throw new Error("Plugin data already set");
    }

    this.pluginData = pluginData;
  }

  public add(blueprint: CommandBlueprint) {
    const preFilters = Array.from(blueprint.config?.preFilters ?? []);
    preFilters.unshift(restrictCommandSource, checkCommandPermission);

    const postFilters = Array.from(blueprint.config?.postFilters ?? []);
    postFilters.unshift(checkCommandCooldown, checkCommandLocks);

    const config = { ...blueprint.config, preFilters, postFilters };
    const command = this.manager.add(blueprint.trigger, blueprint.parameters, config);
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
      pluginData: this.pluginData
    });

    if (!command) {
      return;
    }

    if (findMatchingCommandResultHasError(command)) {
      const usageLine = getCommandSignature(command.command);
      msg.channel.createMessage(`${command.error}\nUsage: \`${usageLine}\``);
      return;
    }

    await this.runCommand(msg, command, command.args, command.opts);
  }

  private async runCommand(
    msg: Message,
    command: ICommandDefinition<CommandContext, ICommandExtraData>,
    args: IArgumentMap = {},
    opts: IMatchedOptionMap = {}
  ): Promise<void> {
    const handler = this.handlers.get(command.id);

    const argValueMap = Object.entries(args).reduce((map, [key, arg]) => {
      map[key] = arg.value;
      return map;
    }, {});

    const optValueMap = Object.entries(opts).reduce((map, [key, opt]) => {
      map[key] = opt.value;
      return map;
    }, {});

    const finalArgs = { ...argValueMap, ...optValueMap };
    const meta: CommandMeta = {
      message: msg,
      pluginData: this.pluginData,
      command
    };

    await handler(finalArgs, meta);
  }
}