import { BasePluginEventManager, Listener, OnOpts, WrappedListener } from "./BasePluginEventManager";
import { GlobalPluginData } from "..";
import { EventArguments, ValidEvent } from "./eventTypes";
import { FilteredListener, ignoreBots, ignoreSelf, withFilters } from "./eventFilters";
import { AnyGlobalEventListenerBlueprint } from "../plugins/PluginBlueprint";

export class GlobalPluginEventManager<TPluginData extends GlobalPluginData<any>> extends BasePluginEventManager<
  TPluginData
> {
  registerEventListener<T extends AnyGlobalEventListenerBlueprint<TPluginData>>(blueprint: T): WrappedListener {
    if (!this.listeners.has(blueprint.event)) {
      this.listeners.set(blueprint.event, new Set());
    }

    const filters = blueprint.filters || [];

    if (!blueprint.allowSelf) {
      filters.unshift(ignoreSelf());
    }

    if (!blueprint.allowBots) {
      filters.unshift(ignoreBots());
    }

    const filteredListener = withFilters(blueprint.event, blueprint.listener, filters) as FilteredListener<
      Listener<TPluginData["_pluginType"], T["event"]>
    >;

    const wrappedListener: WrappedListener = (args: EventArguments[T["event"]]) => {
      return filteredListener({
        args,
        pluginData: this.pluginData!,
      });
    };

    this.listeners.get(blueprint.event)!.add(wrappedListener);
    this.eventRelay.onAnyEvent(blueprint.event, wrappedListener);

    return wrappedListener;
  }

  off(event: ValidEvent, listener: WrappedListener): void {
    if (!this.listeners.has(event)) {
      return;
    }

    this.listeners.get(event)!.delete(listener);
    this.eventRelay.offAnyEvent(event, listener);
  }

  on<TEventName extends ValidEvent>(
    event: TEventName,
    listener: Listener<TPluginData, TEventName>,
    opts?: OnOpts
  ): WrappedListener {
    return this.registerEventListener({
      ...opts,
      event: event as ValidEvent,
      listener,
    } as AnyGlobalEventListenerBlueprint<TPluginData>);
  }
}
