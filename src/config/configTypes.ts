import { DeepPartial } from "ts-essentials";
import { BasePluginType } from "../plugins/pluginTypes";
import { Awaitable } from "../utils";

export interface PermissionLevels {
  [roleOrUserId: string]: number;
}

export interface BaseConfig<TPluginType extends BasePluginType> {
  prefix?: string;

  levels?: PermissionLevels;

  plugins?: {
    [key: string]: PartialPluginOptions<TPluginType>;
  };
}

export interface PartialPluginOptions<TPluginType extends BasePluginType> {
  enabled?: boolean;
  config?: DeepPartial<TPluginType["config"]>;
  overrides?: Array<PluginOverride<TPluginType>>;
  replaceDefaultOverrides?: boolean;
}

export interface PluginOptions<TPluginType extends BasePluginType> {
  enabled?: boolean;
  config: TPluginType["config"];
  overrides?: Array<PluginOverride<TPluginType>>;
  replaceDefaultOverrides?: boolean;
}

export type PluginOverride<TPluginType extends BasePluginType> = PluginOverrideCriteria<
  TPluginType["customOverrideCriteria"]
> & {
  config?: DeepPartial<TPluginType["config"]>;
};

export interface PluginOverrideCriteria<TCustomOverrideCriteria> {
  channel?: string | string[] | null;
  category?: string | string[] | null;
  level?: string | string[] | null;
  user?: string | string[] | null;
  role?: string | string[] | null;

  all?: Array<PluginOverrideCriteria<TCustomOverrideCriteria>> | null;
  any?: Array<PluginOverrideCriteria<TCustomOverrideCriteria>> | null;
  not?: PluginOverrideCriteria<TCustomOverrideCriteria> | null;

  extra?: TCustomOverrideCriteria | null;
}

export interface BasePluginConfig {
  [key: string]: any;
}

export type ConfigValidatorFn<TPluginType extends BasePluginType> = (
  options: PluginOptions<TPluginType>
) => Awaitable<void>;

export type ConfigPreprocessorFn<TPluginType extends BasePluginType> = (
  options: PluginOptions<TPluginType>
) => Awaitable<PluginOptions<TPluginType>>;
