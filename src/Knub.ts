import { Client, Guild } from "eris";
import { EventEmitter } from "events";
import { BaseConfig } from "./config/configTypes";
import { get } from "./utils";
import { LockManager } from "./locks/LockManager";
import {
  AfterUnloadPluginData,
  AnyPluginData,
  BasePluginData,
  BeforeLoadPluginData,
  GlobalPluginData,
  GuildPluginData,
} from "./plugins/PluginData";
import { PluginConfigManager } from "./config/PluginConfigManager";
import { PluginCommandManager } from "./commands/PluginCommandManager";
import { CooldownManager } from "./cooldowns/CooldownManager";
import { PluginLoadError } from "./plugins/PluginLoadError";
import { defaultGetConfig, defaultGetEnabledGuildPlugins, PluginPublicInterface } from "./plugins/pluginUtils";
import {
  AnyContext,
  GlobalContext,
  GlobalPluginMap,
  GuildContext,
  GuildPluginMap,
  KnubArgs,
  KnubOptions,
  LoadedGlobalPlugin,
  LoadedGuildPlugin,
  LogFn,
} from "./types";
import { PluginNotLoadedError } from "./plugins/PluginNotLoadedError";
import {
  AnyGlobalEventListenerBlueprint,
  AnyGuildEventListenerBlueprint,
  AnyPluginBlueprint,
  PluginBlueprintPublicInterface,
  ResolvedPluginBlueprintPublicInterface,
} from "./plugins/PluginBlueprint";
import { UnknownPluginError } from "./plugins/UnknownPluginError";
import { BasePluginType } from "./plugins/pluginTypes";
import { ConfigValidationError } from "./config/ConfigValidationError";
import { GuildPluginEventManager } from "./events/GuildPluginEventManager";
import { EventRelay } from "./events/EventRelay";
import { GlobalPluginEventManager } from "./events/GlobalPluginEventManager";
import { Queue } from "./Queue";

const defaultKnubArgs: KnubArgs<BaseConfig<BasePluginType>> = {
  guildPlugins: [],
  globalPlugins: [],
  options: {},
};

const defaultLogFn: LogFn = (level: string, ...args) => {
  /* eslint-disable no-console */
  if (level === "error") {
    console.error("[ERROR]", ...args);
  } else if (level === "warn") {
    console.warn("[WARN]", ...args);
  } else {
    console.log(`[${level.toUpperCase()}]`, ...args);
  }
};

export class Knub<
  TGuildConfig extends BaseConfig<any> = BaseConfig<BasePluginType>,
  TGlobalConfig extends BaseConfig<any> = BaseConfig<BasePluginType>
> extends EventEmitter {
  protected client: Client;
  protected eventRelay: EventRelay;

  protected guildPlugins: GuildPluginMap = new Map() as GuildPluginMap;
  protected globalPlugins: GlobalPluginMap = new Map() as GlobalPluginMap;

  protected loadedGuilds: Map<string, GuildContext<TGuildConfig>> = new Map<string, GuildContext<TGuildConfig>>();
  // Guild loads and unloads are queued up to avoid race conditions
  protected guildLoadQueues: Map<string, Queue> = new Map<string, Queue>();
  protected globalContext: GlobalContext<TGlobalConfig>;
  protected globalContextLoaded = false;

  protected options: KnubOptions<TGuildConfig>;

  protected log: LogFn = defaultLogFn;

  constructor(client: Client, userArgs: Partial<KnubArgs<TGuildConfig>>) {
    super();

    const args: KnubArgs<TGuildConfig> = {
      ...defaultKnubArgs,
      ...userArgs,
    };

    this.client = client;
    this.eventRelay = new EventRelay(client);

    this.globalContext = {
      // @ts-ignore: This property is always set in loadGlobalConfig() before it can be used by plugins
      config: null,
      loadedPlugins: new Map<string, LoadedGlobalPlugin<any>>(),
      locks: new LockManager(),
    };

    const uniquePluginNames = new Set();
    const validatePlugin = (plugin: AnyPluginBlueprint) => {
      if (plugin.name == null) {
        throw new Error(`No plugin name specified for plugin`);
      }

      if (uniquePluginNames.has(plugin.name)) {
        throw new Error(`Duplicate plugin name: ${plugin.name}`);
      }

      uniquePluginNames.add(plugin.name);
    };

    for (const globalPlugin of args.globalPlugins) {
      validatePlugin(globalPlugin);
      this.globalPlugins.set(globalPlugin.name, globalPlugin);
    }

    for (const guildPlugin of args.guildPlugins) {
      validatePlugin(guildPlugin);
      this.guildPlugins.set(guildPlugin.name, guildPlugin);
    }

    const defaultOptions: KnubOptions<TGuildConfig> = {
      getConfig: defaultGetConfig,
      getEnabledGuildPlugins: defaultGetEnabledGuildPlugins,
      canLoadGuild: () => true,
      customArgumentTypes: {},

      sendErrorMessageFn(channel, body) {
        void channel.createMessage({
          embed: {
            description: body,
            color: parseInt("ee4400", 16),
          },
        });
      },

      sendSuccessMessageFn(channel, body) {
        void channel.createMessage({
          embed: {
            description: body,
            color: parseInt("1ac600", 16),
          },
        });
      },
    };

    this.options = { ...defaultOptions, ...args.options };

    if (this.options.logFn) {
      this.log = this.options.logFn;
    }
  }

  public async run(): Promise<void> {
    const loadErrorInterval = setInterval(() => {
      this.log("info", "Still connecting...");
    }, 30 * 1000);

    this.client.once("connect", () => {
      clearInterval(loadErrorInterval);
      this.log("info", "Bot connected!");
    });

    this.client.once("ready", async () => {
      this.log("info", "Received READY");
      this.log("info", "- Loading global plugins...");

      await this.loadGlobalContext();

      this.log("info", "- Loading available servers that haven't been loaded yet...");
      await this.loadAllAvailableGuilds();

      this.log("info", "Done!");
      this.emit("loadingFinished");
    });

    this.client.on("guildCreate", (guild: Guild) => {
      this.log("info", `Joined guild: ${guild.id}`);
      void this.loadGuild(guild.id);
    });

    this.client.on("guildAvailable", (guild: Guild) => {
      this.log("info", `Guild available: ${guild.id}`);
      void this.loadGuild(guild.id);
    });

    this.client.on("guildUnavailable", (guild: Guild) => {
      this.log("info", `Guild unavailable: ${guild.id}`);
      void this.unloadGuild(guild.id);
    });

    await this.client.connect();
  }

  public async stop(): Promise<void> {
    await this.unloadAllGuilds();
    await this.unloadGlobalContext();
    this.client.disconnect({ reconnect: false });
  }

  public getAvailablePlugins(): GuildPluginMap {
    return this.guildPlugins;
  }

  public getGlobalPlugins(): GlobalPluginMap {
    return this.globalPlugins;
  }

  public getGlobalConfig(): TGlobalConfig {
    return this.globalContext.config;
  }

  /**
   * Create the partial PluginData that's passed to beforeLoad()
   */
  protected async getBeforeLoadPluginData(
    ctx: AnyContext<BaseConfig<any>, BaseConfig<any>>,
    plugin: AnyPluginBlueprint,
    loadedAsDependency: boolean
  ): Promise<BeforeLoadPluginData<BasePluginData<any>>> {
    const configManager = new PluginConfigManager(
      plugin.defaultOptions ?? { config: {} },
      (get(ctx.config, `plugins.${plugin.name}`) as any) || {},
      ctx.config.levels || {},
      {
        customOverrideCriteriaFunctions: plugin.customOverrideCriteriaFunctions,
        preprocessor: plugin.configPreprocessor,
        validator: plugin.configValidator,
      }
    );

    try {
      await configManager.init();
    } catch (e) {
      if (e instanceof ConfigValidationError) {
        throw new PluginLoadError(plugin.name, ctx, e);
      }

      throw e;
    }

    return {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      _pluginType: undefined as any,
      loaded: false,
      client: this.client,
      config: configManager,
      locks: ctx.locks,
      cooldowns: new CooldownManager(),
      fullConfig: ctx.config,

      loadedAsDependency,

      // @ts-ignore: This is actually correct, dw about it
      getKnubInstance: () => this,

      state: {},
    };
  }

  /**
   * Convert the partial PluginData from getBeforeLoadPluginData() to a full PluginData object
   */
  protected withFinalPluginDataProperties<TPluginData extends BasePluginData<any>>(
    ctx: AnyContext<any, any>,
    beforeLoadPluginData: BeforeLoadPluginData<TPluginData>
  ): TPluginData {
    return {
      ...beforeLoadPluginData,
      hasPlugin: (resolvablePlugin) => this.ctxHasPlugin(ctx, resolvablePlugin),
      getPlugin: (resolvablePlugin) => this.getPluginPublicInterface(ctx, resolvablePlugin),
    } as TPluginData;
  }

  /**
   * Convert a full PluginData object to the partial object that's passed to afterUnload() functions
   */
  protected getAfterUnloadPluginData<TPluginData extends BasePluginData<any>>(
    pluginData: TPluginData
  ): AfterUnloadPluginData<TPluginData> {
    return {
      ...pluginData,
      hasPlugin: undefined,
      getPlugin: undefined,
    };
  }

  protected resolveDependencies(
    plugin: AnyPluginBlueprint,
    resolvedDependencies: Set<string> = new Set()
  ): Set<string> {
    if (!plugin.dependencies) {
      return resolvedDependencies;
    }

    for (const dependency of plugin.dependencies) {
      if (!resolvedDependencies.has(dependency.name)) {
        resolvedDependencies.add(dependency.name);

        // Resolve transitive dependencies
        this.resolveDependencies(dependency, resolvedDependencies);
      }
    }

    return resolvedDependencies;
  }

  protected ctxHasPlugin(ctx: AnyContext<TGuildConfig, TGlobalConfig>, plugin: AnyPluginBlueprint): boolean {
    return ctx.loadedPlugins.has(plugin.name);
  }

  protected resolvePluginBlueprintPublicInterface<T extends AnyPluginBlueprint, TPublic = T["public"]>(
    blueprint: T,
    pluginData: AnyPluginData<any>
  ): TPublic extends PluginBlueprintPublicInterface<any> ? ResolvedPluginBlueprintPublicInterface<TPublic> : null {
    if (!blueprint.public) {
      return null!;
    }

    // @ts-ignore
    return Array.from(Object.entries(blueprint.public)).reduce((obj, [prop, fn]) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const finalFn = fn(pluginData);
      obj[prop] = (...args) => {
        if (!pluginData.loaded) {
          throw new PluginNotLoadedError(
            `Tried to access plugin public interface (${blueprint.name}), but the plugin is no longer loaded`
          );
        }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-return
        return finalFn(...args);
      };
      return obj;
    }, {}) as ResolvedPluginBlueprintPublicInterface<any>;
  }

  protected getPluginPublicInterface<T extends AnyPluginBlueprint>(
    ctx: AnyContext<TGuildConfig, TGlobalConfig>,
    plugin: T
  ): PluginPublicInterface<T> {
    if (!ctx.loadedPlugins.has(plugin.name)) {
      throw new PluginNotLoadedError(`Plugin ${plugin.name} is not loaded`);
    }

    const loadedPlugin = ctx.loadedPlugins.get(plugin.name)!;
    const publicInterface = this.resolvePluginBlueprintPublicInterface(loadedPlugin.blueprint, loadedPlugin.pluginData);

    return publicInterface as PluginPublicInterface<T>;
  }

  protected async loadAllAvailableGuilds(): Promise<void> {
    const guilds: Guild[] = Array.from(this.client.guilds.values());
    const loadPromises = guilds.map((guild) => this.loadGuild(guild.id));

    await Promise.all(loadPromises);
  }

  public async loadGuild(guildId: string): Promise<void> {
    return this.getGuildLoadQueue(guildId).add(async () => {
      if (this.loadedGuilds.has(guildId)) {
        return;
      }

      // Only load the guild if we're actually in the guild
      if (!this.client.guilds.has(guildId)) {
        return;
      }

      const guildContext: GuildContext<TGuildConfig> = {
        guildId,
        // @ts-ignore: This property is always set below before it can be used by plugins
        config: null,
        loadedPlugins: new Map<string, LoadedGuildPlugin<any>>(),
        locks: new LockManager(),
      };

      try {
        await this.loadGuildConfig(guildContext);
        await this.loadGuildPlugins(guildContext);
      } catch (err) {
        await this.unloadGuild(guildId);
        throw err;
      }

      this.loadedGuilds.set(guildId, guildContext);
      this.emit("guildLoaded", guildId);
    });
  }

  public async reloadGuild(guildId: string): Promise<void> {
    await this.unloadGuild(guildId);
    await this.loadGuild(guildId);
  }

  public async unloadGuild(guildId: string): Promise<void> {
    // Loads and unloads are queued up to avoid race conditions
    return this.getGuildLoadQueue(guildId).add(async () => {
      const ctx = this.loadedGuilds.get(guildId);
      if (!ctx) {
        return;
      }

      const pluginsToUnload = Array.from(ctx.loadedPlugins.entries());

      // 1. Run each plugin's beforeUnload() function
      for (const [_, loadedPlugin] of pluginsToUnload) {
        await loadedPlugin.blueprint.beforeUnload?.(loadedPlugin.pluginData);
      }

      // 2. Remove event listeners and mark each plugin as unloaded
      for (const [pluginName, loadedPlugin] of pluginsToUnload) {
        loadedPlugin.pluginData.events.clearAllListeners();
        loadedPlugin.pluginData.loaded = false;
        ctx.loadedPlugins.delete(pluginName);
      }

      // 3. Run each plugin's afterUnload() function
      for (const [_, loadedPlugin] of pluginsToUnload) {
        const afterUnloadPluginData = this.getAfterUnloadPluginData(loadedPlugin.pluginData);
        await loadedPlugin.blueprint.afterUnload?.(afterUnloadPluginData);
      }

      this.loadedGuilds.delete(ctx.guildId);
      this.emit("guildUnloaded", ctx.guildId);
    });
  }

  protected async unloadAllGuilds(): Promise<void> {
    const loadedGuilds = this.getLoadedGuilds();
    const unloadPromises = loadedGuilds.map((loadedGuild) => this.unloadGuild(loadedGuild.guildId));

    await Promise.all(unloadPromises);
  }

  protected getGuildLoadQueue(guildId: string): Queue {
    if (!this.guildLoadQueues.has(guildId)) {
      const queueTimeout = 60 * 1000; // 1 minute, should be plenty to allow plugins time to load/unload properly
      this.guildLoadQueues.set(guildId, new Queue(queueTimeout));
    }

    return this.guildLoadQueues.get(guildId)!;
  }

  public getLoadedGuild(guildId: string): GuildContext<TGuildConfig> | undefined {
    return this.loadedGuilds.get(guildId);
  }

  public getLoadedGuilds(): Array<GuildContext<TGuildConfig>> {
    return Array.from(this.loadedGuilds.values());
  }

  protected async loadGuildConfig(ctx: GuildContext<TGuildConfig>): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    ctx.config = await this.options.getConfig(ctx.guildId);
  }

  protected async loadGuildPlugins(ctx: GuildContext<TGuildConfig>): Promise<void> {
    const enabledPlugins = await this.options.getEnabledGuildPlugins!(ctx, this.guildPlugins);
    const dependencies: Set<string> = new Set();
    for (const pluginName of enabledPlugins) {
      this.resolveDependencies(this.guildPlugins.get(pluginName)!, dependencies);
    }

    // Reverse the order of dependencies so transitive dependencies get loaded first
    const dependenciesArr = Array.from(dependencies.values()).reverse();

    const pluginsToLoad = Array.from(new Set([...dependenciesArr, ...enabledPlugins]));

    for (const pluginName of pluginsToLoad) {
      if (!this.guildPlugins.has(pluginName)) {
        throw new UnknownPluginError(`Unknown plugin: ${pluginName}`);
      }

      const plugin = this.guildPlugins.get(pluginName)!;
      const isDependency = !enabledPlugins.includes(pluginName);

      const preloadPluginData = (await this.getBeforeLoadPluginData(ctx, plugin, isDependency)) as BeforeLoadPluginData<
        GuildPluginData<any>
      >;
      preloadPluginData.context = "guild";
      preloadPluginData.guild = this.client.guilds.get(ctx.guildId)!;

      preloadPluginData.events = new GuildPluginEventManager(this.eventRelay);
      preloadPluginData.commands = new PluginCommandManager(this.client, {
        prefix: ctx.config.prefix,
      });

      const fullPluginData = this.withFinalPluginDataProperties(ctx, preloadPluginData);

      preloadPluginData.events.setPluginData(fullPluginData);
      preloadPluginData.commands.setPluginData(fullPluginData);
      preloadPluginData.config.setPluginData(fullPluginData);

      try {
        await plugin.beforeLoad?.(preloadPluginData);
      } catch (e) {
        throw new PluginLoadError(plugin.name, ctx, e);
      }

      if (!isDependency) {
        // Register event listeners
        if (plugin.events) {
          for (const eventListenerBlueprint of plugin.events) {
            fullPluginData.events.registerEventListener({
              ...eventListenerBlueprint,
              listener: eventListenerBlueprint.listener,
            } as AnyGuildEventListenerBlueprint<GuildPluginData<any>>);
          }
        }

        // Register commands
        if (plugin.commands) {
          for (const commandBlueprint of plugin.commands) {
            fullPluginData.commands.add({
              ...commandBlueprint,
              run: commandBlueprint.run,
            });
          }
        }

        // Initialize messageCreate event listener for commands
        fullPluginData.events.on("messageCreate", ({ args: { message }, pluginData: _pluginData }) => {
          return _pluginData.commands.runFromMessage(message);
        });
      }

      fullPluginData.loaded = true;
      ctx.loadedPlugins.set(pluginName, {
        blueprint: plugin,
        pluginData: fullPluginData,
      });
    }

    // Run afterLoad functions
    for (const loadedPlugin of ctx.loadedPlugins.values()) {
      await loadedPlugin.blueprint.afterLoad?.(loadedPlugin.pluginData);
    }
  }

  /**
   * The global context analogue to loadGuild()
   */
  public async loadGlobalContext(): Promise<void> {
    if (this.globalContextLoaded) {
      return;
    }

    const globalContext = {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      config: await this.options.getConfig("global"),
      loadedPlugins: new Map(),
      locks: new LockManager(),
    };

    await this.loadGlobalPlugins(globalContext);

    this.globalContext = globalContext;
    this.globalContextLoaded = true;
  }

  public async reloadGlobalContext(): Promise<void> {
    await this.unloadGlobalContext();
    await this.loadGlobalContext();
  }

  public async unloadGlobalContext(): Promise<void> {
    const pluginsToUnload = Array.from(this.globalContext.loadedPlugins.entries());

    // 1. Run each plugin's beforeUnload() function
    for (const [_, loadedPlugin] of pluginsToUnload) {
      await loadedPlugin.blueprint.beforeUnload?.(loadedPlugin.pluginData);
    }

    // 2. Remove event listeners and mark each plugin as unloaded
    for (const [pluginName, loadedPlugin] of pluginsToUnload) {
      loadedPlugin.pluginData.events.clearAllListeners();
      loadedPlugin.pluginData.loaded = false;
      this.globalContext.loadedPlugins.delete(pluginName);
    }

    // 3. Run each plugin's afterUnload() function
    for (const [_, loadedPlugin] of pluginsToUnload) {
      const afterUnloadPluginData = this.getAfterUnloadPluginData(loadedPlugin.pluginData);
      await loadedPlugin.blueprint.afterUnload?.(afterUnloadPluginData);
    }

    this.globalContextLoaded = false;
  }

  protected async loadGlobalPlugins(ctx: GlobalContext<TGlobalConfig>): Promise<void> {
    for (const plugin of this.globalPlugins.values()) {
      const beforeLoadPluginData = (await this.getBeforeLoadPluginData(ctx, plugin, false)) as BeforeLoadPluginData<
        GlobalPluginData<any>
      >;
      beforeLoadPluginData.context = "global";

      beforeLoadPluginData.events = new GlobalPluginEventManager(this.eventRelay);
      beforeLoadPluginData.commands = new PluginCommandManager(this.client, {
        prefix: ctx.config.prefix,
      });

      const fullPluginData = this.withFinalPluginDataProperties(ctx, beforeLoadPluginData);

      beforeLoadPluginData.events.setPluginData(fullPluginData);
      beforeLoadPluginData.commands.setPluginData(fullPluginData);
      beforeLoadPluginData.config.setPluginData(fullPluginData);

      try {
        await plugin.beforeLoad?.(beforeLoadPluginData);
      } catch (e) {
        throw new PluginLoadError(plugin.name, ctx, e);
      }

      // Register event listeners
      if (plugin.events) {
        for (const eventListenerBlueprint of plugin.events) {
          fullPluginData.events.registerEventListener({
            ...eventListenerBlueprint,
            listener: eventListenerBlueprint.listener,
          } as AnyGlobalEventListenerBlueprint<GlobalPluginData<any>>);
        }
      }

      // Register commands
      if (plugin.commands) {
        for (const commandBlueprint of plugin.commands) {
          fullPluginData.commands.add({
            ...commandBlueprint,
            run: commandBlueprint.run,
          });
        }
      }

      // Initialize messageCreate event listener for commands
      fullPluginData.events.on("messageCreate", ({ args: { message }, pluginData: _pluginData }) => {
        return _pluginData.commands.runFromMessage(message);
      });

      fullPluginData.loaded = true;
      ctx.loadedPlugins.set(plugin.name, {
        pluginData: fullPluginData,
        blueprint: plugin,
      });
    }

    for (const loadedPlugin of ctx.loadedPlugins.values()) {
      await loadedPlugin.blueprint.afterLoad?.(loadedPlugin.pluginData);
    }
  }
}
