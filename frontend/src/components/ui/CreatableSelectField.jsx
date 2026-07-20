const CREATE_NEW_VALUE = '__syntask_create_new__'

export function CreatableSelectField({
  id,
  name,
  label,
  value,
  onChange,
  children,
  disabled = false,
  required = false,
  className = 'input',
  createLabel = 'Create new',
  onCreate,
  canCreate = true,
  helper,
}) {
  return (
    <div>
      {label ? (
        <label htmlFor={id || name} className="mb-1 block text-sm font-medium text-gray-700 dark:text-[var(--color-app-text-secondary)]">
          {label}
        </label>
      ) : null}
      <select
        id={id || name}
        name={name}
        value={value}
        onChange={(event) => {
          if (event.target.value === CREATE_NEW_VALUE) {
            event.preventDefault()
            onCreate?.()
            return
          }
          onChange?.(event.target.value, event)
        }}
        className={className}
        disabled={disabled}
        required={required}
      >
        {children}
        {canCreate && onCreate ? <option value={CREATE_NEW_VALUE}>+ {createLabel}</option> : null}
      </select>
      {helper ? <p className="mt-1 text-xs text-gray-500 dark:text-[var(--color-app-text-muted)]">{helper}</p> : null}
    </div>
  )
}
