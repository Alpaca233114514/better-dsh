/** Public runtime-provided primitives; no second copy of the UI library. */
declare module '@deepseek-ai/dsh-client-ui-primitives' {
  import type { ComponentType, InputHTMLAttributes, ButtonHTMLAttributes } from 'react'
  export const Switch: ComponentType<{ checked: boolean; onChange(value: boolean): void; label: string; disabled?: boolean }>
  export const Input: ComponentType<InputHTMLAttributes<HTMLInputElement>>
  export const Button: ComponentType<ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'outline'; size?: 'sm' | 'md' }>
}
