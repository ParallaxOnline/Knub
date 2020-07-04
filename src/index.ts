import "reflect-metadata";

export { Knub } from "./Knub";

export { PluginClass } from "./plugins/PluginClass";
export { PluginBlueprint } from "./plugins/PluginBlueprint";

import * as decorators from "./plugins/decorators";
export { decorators };

export { logger } from "./logger";

import * as configUtils from "./config/configUtils";
export { configUtils };
export { ConfigValidationError } from "./config/ConfigValidationError";

import * as pluginUtils from "./plugins/pluginUtils";
export { pluginUtils };

export { PluginData } from "./plugins/PluginData";

export { KnubOptions, KnubArgs, BaseContext, GuildContext, GlobalContext } from "./types";

export {
  PermissionLevels,
  BasePluginConfig,
  BaseConfig,
  PartialPluginOptions,
  PluginOptions,
} from "./config/configTypes";

export { BasePluginType } from "./plugins/pluginTypes";

export { getCommandSignature, PluginCommandConfig, CommandContext } from "./commands/commandUtils";

export * from "./commands/baseTypeConverters";

import * as helpers from "./helpers";
export { helpers };

export { PluginError } from "./plugins/PluginError";

export { PluginConfigManager } from "./config/PluginConfigManager";
export { PluginCommandManager } from "./commands/PluginCommandManager";
export { PluginEventManager } from "./events/PluginEventManager";
export { LockManager, Lock } from "./locks/LockManager";
export { CooldownManager } from "./cooldowns/CooldownManager";

export { TypeConversionError, parseSignature } from "knub-command-manager";

export { command } from "./commands/CommandBlueprint";
export { eventListener } from "./events/EventListenerBlueprint";
export { plugin } from "./plugins/PluginBlueprint";
