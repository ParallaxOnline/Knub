import { BaseConfig, PermissionLevels } from "../config/configTypes";
import { Guild, Member } from "eris";
import {
  AnyPluginBlueprint,
  GlobalPluginBlueprint,
  GuildPluginBlueprint,
  PluginBlueprintPublicInterface,
  ResolvedPluginBlueprintPublicInterface,
} from "./PluginBlueprint";
import path from "path";
import _fs from "fs";
import { AnyContext, GlobalContext, GuildContext, GuildPluginMap } from "../types";

const fs = _fs.promises;

interface PartialMember {
  id: Member["id"];
  roles: Member["roles"];
}

export function getMemberLevel(levels: PermissionLevels, partialMember: PartialMember, guild: Guild): number {
  if (guild.ownerID === partialMember.id) {
    return 99999;
  }

  // Due to inconsitencies in Eris caching, fetch the guild member.
  let member: Member | PartialMember | undefined = guild.members.get(partialMember.id);
  if (!member) member = partialMember;

  for (const [id, level] of Object.entries(levels)) {
    if (member.id === id || (member.roles && member.roles.includes(id))) {
      return level;
    }
  }

  return 0;
}

export function isGuildContext(ctx: AnyContext<any, any>): ctx is GuildContext<any> {
  return (ctx as any).guildId != null;
}

export function isGlobalContext(ctx: AnyContext<any, any>): ctx is GuildContext<any> {
  return !isGuildContext(ctx);
}

export function isGuildBlueprintByContext(
  _ctx: GuildContext<any>,
  _blueprint: AnyPluginBlueprint
): _blueprint is GuildPluginBlueprint<any> {
  return true;
}

export function isGlobalBlueprintByContext(
  _ctx: GlobalContext<any>,
  _blueprint: AnyPluginBlueprint
): _blueprint is GlobalPluginBlueprint<any> {
  return true;
}

export type PluginPublicInterface<T extends AnyPluginBlueprint> =
  T["public"] extends PluginBlueprintPublicInterface<any> ? ResolvedPluginBlueprintPublicInterface<T["public"]> : null;

/**
 * Load JSON config files from a "config" folder, relative to cwd
 */
export async function defaultGetConfig(key) {
  const configFile = key ? `${key}.json` : "global.json";
  const configPath = path.join("config", configFile);

  try {
    await fs.access(configPath);
  } catch (e) {
    return {};
  }

  const json = await fs.readFile(configPath, { encoding: "utf8" });
  return JSON.parse(json);
}

/**
 * By default, load all guild plugins that haven't been explicitly disabled
 */
export function defaultGetEnabledGuildPlugins(
  ctx: AnyContext<BaseConfig<any>, BaseConfig<any>>,
  guildPlugins: GuildPluginMap
) {
  const plugins = ctx.config.plugins ?? {};
  return Array.from(guildPlugins.keys()).filter((pluginName) => {
    return plugins[pluginName]?.enabled !== false;
  });
}
