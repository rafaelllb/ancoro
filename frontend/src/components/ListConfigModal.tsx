import { useState } from 'react'
import {
  useProjectLists,
  useCreateListItem,
  useUpdateListItem,
  useDeleteListItem,
  ListType,
  ProjectListItem,
} from '../hooks/useProjectLists'

interface ListConfigModalProps {
  isOpen: boolean
  onClose: () => void
  projectId: string
  projectName: string
}

// Configuração das tabs
const LIST_TABS: { type: ListType; label: string; description: string }[] = [
  { type: 'MODULE', label: 'Módulos', description: 'Módulos SAP para categorizar requisitos' },
  { type: 'REQ_STATUS', label: 'Status', description: 'Estados do workflow de requisitos' },
  { type: 'INTEGRATION_TYPE', label: 'Tipo Integração', description: 'Tipos de integração SAP' },
  { type: 'INTEGRATION_TIMING', label: 'Timing', description: 'Timing de execução da integração' },
]

export default function ListConfigModal({ isOpen, onClose, projectId, projectName }: ListConfigModalProps) {
  // Tab ativa
  const [activeTab, setActiveTab] = useState<ListType>('MODULE')

  // Estado do formulário de novo item
  const [isAdding, setIsAdding] = useState(false)
  const [newCode, setNewCode] = useState('')
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#6B7280')

  // Estado de edição
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')

  // Hooks de dados
  const { data: items = [], isLoading } = useProjectLists(projectId, activeTab, true) // inclui inativos
  const createItem = useCreateListItem()
  const updateItem = useUpdateListItem()
  const deleteItem = useDeleteListItem()

  // Reset formulário
  const resetForm = () => {
    setIsAdding(false)
    setNewCode('')
    setNewName('')
    setNewColor('#6B7280')
    setEditingId(null)
  }

  // Handler criar item
  const handleCreate = async () => {
    if (!newCode.trim() || !newName.trim()) return

    try {
      await createItem.mutateAsync({
        projectId,
        listType: activeTab,
        data: {
          code: newCode.toUpperCase().replace(/[^A-Z0-9_]/g, ''),
          name: newName.trim(),
          color: newColor || null,
        },
      })
      resetForm()
    } catch (err) {
      console.error('Erro ao criar item:', err)
    }
  }

  // Handler atualizar item
  const handleUpdate = async (item: ProjectListItem) => {
    if (!editName.trim()) return

    try {
      await updateItem.mutateAsync({
        projectId,
        listType: activeTab,
        itemId: item.id,
        data: {
          name: editName.trim(),
          color: editColor || null,
        },
      })
      setEditingId(null)
    } catch (err) {
      console.error('Erro ao atualizar item:', err)
    }
  }

  // Handler toggle ativo
  const handleToggleActive = async (item: ProjectListItem) => {
    try {
      if (item.isActive) {
        // Desativar (soft delete)
        await deleteItem.mutateAsync({
          projectId,
          listType: activeTab,
          itemId: item.id,
        })
      } else {
        // Reativar
        await updateItem.mutateAsync({
          projectId,
          listType: activeTab,
          itemId: item.id,
          data: { isActive: true },
        })
      }
    } catch (err: any) {
      // Se item está em uso, mostrar erro
      alert(err?.response?.data?.message || 'Erro ao alterar status do item')
    }
  }

  // Iniciar edição
  const startEdit = (item: ProjectListItem) => {
    setEditingId(item.id)
    setEditName(item.name)
    setEditColor(item.color || '#6B7280')
  }

  if (!isOpen) return null

  const activeConfig = LIST_TABS.find((t) => t.type === activeTab)

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Overlay */}
      <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose} />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-2xl bg-white rounded-lg shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Configurar Listas</h2>
              <p className="text-sm text-gray-500">{projectName}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Tabs */}
          <div className="border-b">
            <div className="flex overflow-x-auto px-4">
              {LIST_TABS.map((tab) => (
                <button
                  key={tab.type}
                  onClick={() => {
                    setActiveTab(tab.type)
                    resetForm()
                  }}
                  className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                    activeTab === tab.type
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Conteúdo */}
          <div className="p-6">
            {/* Descrição */}
            <p className="text-sm text-gray-600 mb-4">{activeConfig?.description}</p>

            {/* Botão adicionar */}
            {!isAdding && (
              <button
                onClick={() => setIsAdding(true)}
                className="mb-4 flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Adicionar Item
              </button>
            )}

            {/* Formulário de novo item */}
            {isAdding && (
              <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Código</label>
                    <input
                      type="text"
                      value={newCode}
                      onChange={(e) => setNewCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
                      className="w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-blue-500"
                      placeholder="CODIGO"
                      maxLength={20}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Nome</label>
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-blue-500"
                      placeholder="Nome do item"
                      maxLength={100}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Cor</label>
                    <input
                      type="color"
                      value={newColor}
                      onChange={(e) => setNewColor(e.target.value)}
                      className="w-full h-8 rounded cursor-pointer"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-3">
                  <button
                    onClick={resetForm}
                    className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={createItem.isPending || !newCode.trim() || !newName.trim()}
                    className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    {createItem.isPending ? 'Salvando...' : 'Adicionar'}
                  </button>
                </div>
              </div>
            )}

            {/* Lista de itens */}
            {isLoading ? (
              <div className="text-center py-8 text-gray-500">Carregando...</div>
            ) : items.length === 0 ? (
              <div className="text-center py-8 text-gray-500">Nenhum item configurado</div>
            ) : (
              <div className="space-y-2">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border ${
                      item.isActive ? 'bg-white border-gray-200' : 'bg-gray-100 border-gray-200 opacity-60'
                    }`}
                  >
                    {/* Cor */}
                    <div
                      className="w-6 h-6 rounded-full flex-shrink-0 border"
                      style={{ backgroundColor: item.color || '#6B7280' }}
                    />

                    {/* Conteúdo */}
                    {editingId === item.id ? (
                      // Modo edição
                      <div className="flex-1 flex items-center gap-2">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="flex-1 px-2 py-1 text-sm border rounded"
                        />
                        <input
                          type="color"
                          value={editColor}
                          onChange={(e) => setEditColor(e.target.value)}
                          className="w-8 h-8 rounded cursor-pointer"
                        />
                        <button
                          onClick={() => handleUpdate(item)}
                          disabled={updateItem.isPending}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      // Modo visualização
                      <>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-gray-500">{item.code}</span>
                            {item.isDefault && (
                              <span className="px-1.5 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded">
                                Padrão
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                        </div>

                        {/* Ícone */}
                        {item.icon && <span className="text-lg">{item.icon}</span>}

                        {/* Ações */}
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => startEdit(item)}
                            className="p-1.5 text-gray-400 hover:text-gray-600 rounded"
                            title="Editar"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleToggleActive(item)}
                            disabled={deleteItem.isPending || updateItem.isPending}
                            className={`p-1.5 rounded ${
                              item.isActive
                                ? 'text-red-400 hover:text-red-600'
                                : 'text-green-400 hover:text-green-600'
                            }`}
                            title={item.isActive ? 'Desativar' : 'Reativar'}
                          >
                            {item.isActive ? (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                              </svg>
                            ) : (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t bg-gray-50 rounded-b-lg">
            <div className="flex justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
