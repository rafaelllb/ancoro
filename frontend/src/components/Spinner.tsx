/**
 * Spinner - Componentes de loading spinner reutilizáveis
 *
 * Diferentes tamanhos e variantes de spinner para uso em
 * buttons, overlays, e indicadores de loading.
 */

// ===== SPINNER BASE =====

interface SpinnerProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  color?: 'primary' | 'white' | 'gray' | 'success' | 'danger'
  className?: string
}

const sizeClasses = {
  xs: 'h-3 w-3',
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
  xl: 'h-12 w-12',
}

const colorClasses = {
  primary: 'text-blue-600',
  white: 'text-white',
  gray: 'text-gray-400',
  success: 'text-green-600',
  danger: 'text-red-600',
}

export function Spinner({
  size = 'md',
  color = 'primary',
  className = '',
}: SpinnerProps) {
  return (
    <svg
      className={`animate-spin ${sizeClasses[size]} ${colorClasses[color]} ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )
}

// ===== LOADING BUTTON =====
// Button com spinner integrado para estados de loading

interface LoadingButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean
  loadingText?: string
  variant?: 'primary' | 'secondary' | 'danger' | 'success'
  size?: 'sm' | 'md' | 'lg'
  children: React.ReactNode
}

const buttonVariants = {
  primary: 'bg-blue-600 hover:bg-blue-700 text-white disabled:bg-blue-400',
  secondary: 'bg-gray-200 hover:bg-gray-300 text-gray-800 disabled:bg-gray-100',
  danger: 'bg-red-600 hover:bg-red-700 text-white disabled:bg-red-400',
  success: 'bg-green-600 hover:bg-green-700 text-white disabled:bg-green-400',
}

const buttonSizes = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
}

export function LoadingButton({
  isLoading = false,
  loadingText,
  variant = 'primary',
  size = 'md',
  children,
  disabled,
  className = '',
  ...props
}: LoadingButtonProps) {
  const isDisabled = disabled || isLoading

  return (
    <button
      {...props}
      disabled={isDisabled}
      className={`
        inline-flex items-center justify-center gap-2 font-medium rounded-md
        transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
        disabled:cursor-not-allowed disabled:opacity-70
        ${buttonVariants[variant]}
        ${buttonSizes[size]}
        ${className}
      `}
    >
      {isLoading && (
        <Spinner
          size={size === 'lg' ? 'sm' : 'xs'}
          color={variant === 'secondary' ? 'gray' : 'white'}
        />
      )}
      {isLoading && loadingText ? loadingText : children}
    </button>
  )
}

// ===== FULL PAGE LOADING =====
// Overlay de loading para a página inteira

interface FullPageLoadingProps {
  message?: string
}

export function FullPageLoading({ message = 'Carregando...' }: FullPageLoadingProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm">
      <div className="text-center">
        <Spinner size="xl" color="primary" className="mx-auto mb-4" />
        <p className="text-gray-600 font-medium">{message}</p>
      </div>
    </div>
  )
}

// ===== INLINE LOADING =====
// Loading inline para seções menores

interface InlineLoadingProps {
  message?: string
  className?: string
}

export function InlineLoading({
  message = 'Carregando...',
  className = '',
}: InlineLoadingProps) {
  return (
    <div className={`flex items-center justify-center gap-2 py-4 ${className}`}>
      <Spinner size="sm" color="primary" />
      <span className="text-gray-600 text-sm">{message}</span>
    </div>
  )
}

// ===== LOADING OVERLAY =====
// Overlay sobre um container específico

interface LoadingOverlayProps {
  isLoading: boolean
  message?: string
  children: React.ReactNode
}

export function LoadingOverlay({
  isLoading,
  message = 'Carregando...',
  children,
}: LoadingOverlayProps) {
  return (
    <div className="relative">
      {children}
      {isLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 backdrop-blur-[1px] rounded-lg">
          <div className="text-center">
            <Spinner size="lg" color="primary" className="mx-auto mb-2" />
            <p className="text-gray-600 text-sm">{message}</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default Spinner
