import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react'

/**
 * Estrutura de uma opção de requisito para o autocomplete
 */
export interface RequirementOption {
  reqId: string
  shortDesc: string
  module: string
}

/**
 * Props do componente RequirementMultiSelect
 */
interface RequirementMultiSelectProps {
  /** Array de reqIds atualmente selecionados */
  value: string[]
  /** Callback quando a seleção muda */
  onChange: (value: string[]) => void
  /** Lista de todos os requisitos disponíveis para seleção */
  options: RequirementOption[]
  /** reqId a excluir da lista (não pode depender de si mesmo) */
  excludeReqId?: string
  /** Se o componente está desabilitado */
  disabled?: boolean
  /** Placeholder quando nenhum item selecionado */
  placeholder?: string
  /** Variante de exibição: inline (célula da tabela) ou modal (formulário) */
  variant?: 'inline' | 'modal'
}

/**
 * Componente multi-select com autocomplete para seleção de requisitos.
 *
 * Permite selecionar múltiplos requisitos de uma lista com busca por reqId ou shortDesc.
 * Exibe os selecionados como tags removíveis.
 *
 * Usado em:
 * - RequirementsGrid: edição inline das colunas "Depende de" e "Fornece para"
 * - CreateRequirementModal: campos de dependências no formulário de criação
 */
export function RequirementMultiSelect({
  value,
  onChange,
  options,
  excludeReqId,
  disabled = false,
  placeholder = 'Selecione...',
  variant = 'inline',
}: RequirementMultiSelectProps) {
  // Estado do componente
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)

  // Refs para controle de foco e clique fora
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  /**
   * Filtra as opções baseado no termo de busca e exclusões.
   * - Exclui requisitos já selecionados
   * - Exclui o próprio requisito (excludeReqId)
   * - Filtra por reqId ou shortDesc (case-insensitive)
   * - Limita a 10 resultados
   */
  const filteredOptions = useMemo(() => {
    const searchLower = searchTerm.toLowerCase()

    return options
      .filter((opt) => {
        // Exclui o próprio requisito
        if (excludeReqId && opt.reqId === excludeReqId) return false
        // Exclui já selecionados
        if (value.includes(opt.reqId)) return false
        // Filtra por termo de busca
        if (searchTerm) {
          const matchesReqId = opt.reqId.toLowerCase().includes(searchLower)
          const matchesDesc = opt.shortDesc.toLowerCase().includes(searchLower)
          return matchesReqId || matchesDesc
        }
        return true
      })
      .slice(0, 10) // Limita a 10 resultados para performance
  }, [options, value, excludeReqId, searchTerm])

  /**
   * Resolve os valores selecionados para exibir informações completas.
   * Se o reqId não existir na lista de options, mantém como texto simples.
   */
  const selectedItems = useMemo(() => {
    return value.map((reqId) => {
      const option = options.find((opt) => opt.reqId === reqId)
      return option || { reqId, shortDesc: '', module: '' }
    })
  }, [value, options])

  // Reset do highlighted index quando filteredOptions muda
  useEffect(() => {
    setHighlightedIndex(0)
  }, [filteredOptions.length])

  // Foco no input quando abre
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  // Clique fora fecha o dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setSearchTerm('')
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  /**
   * Adiciona um requisito à seleção
   */
  const handleSelect = useCallback((reqId: string) => {
    onChange([...value, reqId])
    setSearchTerm('')
    setHighlightedIndex(0)
    // Mantém o dropdown aberto para seleção múltipla
    inputRef.current?.focus()
  }, [value, onChange])

  /**
   * Remove um requisito da seleção
   */
  const handleRemove = useCallback((reqId: string) => {
    onChange(value.filter((id) => id !== reqId))
  }, [value, onChange])

  /**
   * Navegação por teclado
   */
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex((prev) =>
          prev < filteredOptions.length - 1 ? prev + 1 : prev
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0))
        break
      case 'Enter':
        e.preventDefault()
        if (filteredOptions[highlightedIndex]) {
          handleSelect(filteredOptions[highlightedIndex].reqId)
        }
        break
      case 'Escape':
        setIsOpen(false)
        setSearchTerm('')
        break
      case 'Backspace':
        // Remove último item se input vazio
        if (!searchTerm && value.length > 0) {
          handleRemove(value[value.length - 1])
        }
        break
    }
  }, [filteredOptions, highlightedIndex, handleSelect, handleRemove, searchTerm, value])

  // Estilos baseados na variante
  const containerStyles = variant === 'inline'
    ? 'min-w-[180px]'
    : 'w-full'

  const dropdownStyles = variant === 'inline'
    ? 'absolute z-50 mt-1 w-64 max-h-60 overflow-auto bg-white border border-gray-300 rounded-md shadow-lg'
    : 'absolute z-50 mt-1 w-full max-h-60 overflow-auto bg-white border border-gray-300 rounded-md shadow-lg'

  if (disabled) {
    // Modo desabilitado: apenas mostra tags sem interação
    return (
      <div className={`flex flex-wrap gap-1 p-1 ${containerStyles}`}>
        {selectedItems.length > 0 ? (
          selectedItems.map((item) => (
            <span
              key={item.reqId}
              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600"
              title={item.shortDesc || item.reqId}
            >
              {item.reqId}
            </span>
          ))
        ) : (
          <span className="text-gray-400 text-sm">-</span>
        )}
      </div>
    )
  }

  return (
    <div ref={containerRef} className={`relative ${containerStyles}`}>
      {/* Container de tags e input */}
      <div
        className={`flex flex-wrap gap-1 p-1.5 min-h-[34px] border rounded-md cursor-text
          ${isOpen ? 'border-blue-500 ring-1 ring-blue-500' : 'border-gray-300'}
          ${variant === 'modal' ? 'bg-white' : 'bg-transparent hover:bg-gray-50'}
        `}
        onClick={() => {
          setIsOpen(true)
          inputRef.current?.focus()
        }}
      >
        {/* Tags dos itens selecionados */}
        {selectedItems.map((item) => (
          <span
            key={item.reqId}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800"
            title={item.shortDesc || item.reqId}
          >
            {item.reqId}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                handleRemove(item.reqId)
              }}
              className="text-blue-600 hover:text-blue-800 focus:outline-none"
            >
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </span>
        ))}

        {/* Input de busca - sempre visível quando aberto ou sem seleção */}
        {(isOpen || selectedItems.length === 0) && (
          <input
            ref={inputRef}
            type="text"
            className="flex-1 min-w-[60px] outline-none text-sm bg-transparent"
            placeholder={selectedItems.length === 0 ? placeholder : ''}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsOpen(true)}
          />
        )}
      </div>

      {/* Dropdown de sugestões */}
      {isOpen && (
        <div className={dropdownStyles}>
          {filteredOptions.length > 0 ? (
            <ul role="listbox">
              {filteredOptions.map((option, index) => (
                <li
                  key={option.reqId}
                  role="option"
                  aria-selected={index === highlightedIndex}
                  className={`px-3 py-2 cursor-pointer text-sm
                    ${index === highlightedIndex ? 'bg-blue-50 text-blue-900' : 'text-gray-900 hover:bg-gray-50'}
                  `}
                  // onMouseDown + preventDefault dispara ANTES do blur/click-outside e mantém o
                  // foco no input, evitando que o dropdown feche antes de registrar a seleção.
                  onMouseDown={(e) => {
                    e.preventDefault()
                    handleSelect(option.reqId)
                  }}
                  onMouseEnter={() => setHighlightedIndex(index)}
                >
                  <span className="font-medium">{option.reqId}</span>
                  {option.shortDesc && (
                    <span className="text-gray-500 ml-2">
                      - {option.shortDesc.length > 30
                          ? option.shortDesc.slice(0, 30) + '...'
                          : option.shortDesc}
                    </span>
                  )}
                  {option.module && (
                    <span className="text-gray-400 text-xs ml-2">
                      ({option.module})
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-3 py-2 text-sm text-gray-500">
              {searchTerm
                ? 'Nenhum requisito encontrado'
                : 'Todos os requisitos já selecionados'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
