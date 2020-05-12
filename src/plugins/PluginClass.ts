import { Client, Guild, Member, TextableChannel } from "eris";
import { BaseConfig, BasePluginConfig, PluginOptions } from "../config/configTypes";
import { CustomArgumentTypes } from "../commands/commandUtils";
import { Knub } from "../Knub";
import { MatchParams } from "../config/configUtils";
import { LockManager } from "../locks/LockManager";
import { CooldownManager } from "../cooldowns/CooldownManager";
import { getMemberLevel } from "./pluginUtils";
import { PluginConfigManager } from "../config/PluginConfigManager";
import { PluginClassData } from "./PluginData";
import { PluginCommandManager } from "../commands/PluginCommandManager";
import { PluginEventManager } from "../events/PluginEventManager";
import { CommandBlueprint } from "../commands/CommandBlueprint";
import { EventListenerBlueprint } from "../events/EventListenerBlueprint";

/**
 * Base class for Knub plugins
 */
export abstract class PluginClass<TConfig extends {} = BasePluginConfig, TCustomOverrideCriteria extends {} = {}> {
  // REQUIRED: Internal name for the plugin
  public static pluginName: string;

  // Arbitrary info about the plugin, e.g. description.
  // This property is mainly here to set a convention, as it's not actually used in Knub itself.
  public static pluginInfo: any;

  // The plugin's default options, including overrides
  public static defaultOptions: PluginOptions<any, any>;

  // Commands that are automatically registered on plugin load
  public static commands: CommandBlueprint[];

  // Event listeners that are automatically registered on plugin load
  public static events: EventListenerBlueprint[];

  // Custom argument types for commands
  public static customArgumentTypes: CustomArgumentTypes;

  // Guild info - these will be null for global plugins
  public readonly guildId: string;
  protected readonly guild: Guild;
  protected readonly guildConfig: BaseConfig;

  protected readonly client: Client;

  protected pluginData: PluginClassData;
  protected config: PluginConfigManager<TConfig, TCustomOverrideCriteria>;
  protected locks: LockManager;
  protected commandManager: PluginCommandManager;
  protected eventManager: PluginEventManager;
  protected cooldowns: CooldownManager;

  /**
   * @deprecated Kept here for backwards compatibility. Not recommended to use directly.
   */
  protected knub: Knub;

  public static _decoratorValuesTransferred = false;

  constructor(pluginData: PluginClassData<TConfig, TCustomOverrideCriteria>) {
    this.pluginData = pluginData;

    this.client = pluginData.client;
    this.guildId = pluginData.guild?.id;
    this.guild = pluginData.guild;
    this.guildConfig = pluginData.guildConfig;
    this.config = pluginData.config;
    this.eventManager = pluginData.events;
    this.commandManager = pluginData.commands;
    this.cooldowns = pluginData.cooldowns;
    this.locks = pluginData.locks;
    this.knub = pluginData.knub;
  }

  /**
   * Code to run when the plugin is loaded
   */
  public onLoad(): any {
    // Implemented by plugin
  }

  /**
   * Code to run when the plugin is unloaded
   */
  public onUnload(): any {
    // Implemented by plugin
  }

  /**
   * Function to resolve custom override criteria in the plugin's config.
   * Remember to also set TCustomOverrideCriteria appropriately.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected matchCustomOverrideCriteria(criteria: TCustomOverrideCriteria, matchParams: MatchParams): boolean {
    // Implemented by plugin
    return true;
  }

  /**
   * Returns the plugin's config with overrides matching the given member id and channel id applied to it
   */
  protected getConfigForMemberIdAndChannelId(memberId: string, channelId: string): TConfig {
    const guildId = this.client.channelGuildMap[channelId];
    const guild = this.client.guilds.get(guildId);
    const member = guild.members.get(memberId);
    const level = member ? this.getMemberLevel(member) : null;
    const categoryId = guild.channels.has(channelId) ? guild.channels.get(channelId).parentID : null;

    return this.config.getMatchingConfig({
      level,
      userId: memberId,
      channelId,
      categoryId,
      memberRoles: member ? member.roles : [],
    });
  }

  /**
   * Returns the member's permission level
   */
  protected getMemberLevel(member: Partial<Member>): number {
    return getMemberLevel(this.guildConfig.levels, member as Member);
  }

  /**
   * Checks whether the specified plugin for the same guild as this plugin exists
   * Useful for interoperability between plugins
   */
  protected hasPlugin(name: string): boolean {
    const guildData = this.knub.getLoadedGuild(this.guildId);
    return guildData.loadedPlugins.has(name);
  }

  /**
   * Returns the specified plugin for the same guild as this plugin
   * Useful for interoperability between plugins
   */
  protected getPlugin<T extends PluginClass>(name: string): T {
    const guildData = this.knub.getLoadedGuild(this.guildId);
    return guildData.loadedPlugins.get(name)?.instance as T;
  }

  protected sendErrorMessage(channel: TextableChannel, body: string) {
    this.knub.sendErrorMessage(channel, body);
  }

  protected sendSuccessMessage(channel: TextableChannel, body: string) {
    this.knub.sendSuccessMessage(channel, body);
  }
}

export class AnyExtendedPluginClass extends PluginClass<any> {}
