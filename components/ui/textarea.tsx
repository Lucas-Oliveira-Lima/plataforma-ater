import { forwardRef, type TextareaHTMLAttributes } from 'react'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className = '', id, ...props }, ref) => {
    const textareaId = id || label?.toLowerCase().replace(/\s+/g, '-')

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={textareaId} className="text-sm font-medium text-gray-700">
            {label}
            {props.required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          rows={4}
          className={`
            w-full rounded-xl border px-4 py-3 text-base text-gray-900 placeholder-gray-400
            focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent
            disabled:bg-gray-100 disabled:cursor-not-allowed resize-none
            ${error ? 'border-red-400 bg-red-50' : 'border-gray-300 bg-white'}
            ${className}
          `}
          {...props}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    )
  }
)

Textarea.displayName = 'Textarea'
