/**
 * Type declarations for @storybook/react-native
 * These types enable TypeScript support for Storybook stories
 */

declare module '@storybook/react-native' {
  import type { ComponentType } from 'react';

  export interface StorybookConfig {
    enableWebsockets?: boolean;
    shouldPersistSelection?: boolean;
  }

  export function getStorybookUI(config?: StorybookConfig): ComponentType;

  // Generic meta type that extracts props from the component type
  export type Meta<TComponent = ComponentType<Record<string, unknown>>> = {
    title: string;
    component: TComponent;
    tags?: string[];
    decorators?: ((Story: ComponentType) => JSX.Element)[];
    argTypes?: Record<string, {
      control?: string | { type: string; [key: string]: unknown };
      description?: string;
      [key: string]: unknown;
    }>;
  };

  // Story object type that extracts props from meta
  export type StoryObj<TMeta = Meta> = {
    args?: TMeta extends Meta<infer TComponent>
      ? TComponent extends ComponentType<infer TProps>
        ? TProps
        : Record<string, unknown>
      : Record<string, unknown>;
    parameters?: Record<string, unknown>;
  };
}
