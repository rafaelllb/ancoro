/**
 * ManageMembersModal - Modal para gerenciamento de membros do projeto
 *
 * Permite adicionar, remover e atualizar módulos de membros do projeto.
 * Apenas ADMIN ou MANAGER podem acessar este modal.
 *
 * @author Rafael Brito
 */

import { useState, useEffect } from 'react'
import {
  useProjectMembers,
  useAvailableUsers,
  useAddMember,
  useUpdateMember,
  useRemoveMember,
  SAP_MODULES,
} from '../hooks/useProjectMembers'
import { useAuth } from '../contexts/AuthContext'

interface ManageMembersModalProps {
  isOpen: boolean
  onClose: () => void
  projectId: string
}

// Cores por role para avatars
const roleColors: Record<string, string> = {
  ADMIN: 'bg-purple-500',
  MANAGER: 'bg-blue-500',
  CONSULTANT: 'bg-green-500',
  CLIENT: 'bg-orange-500',
}

// Labels amigáveis para roles
const roleLabels: Record<string, string> = {
  ADMIN: 'Admin',
  MANAGER: 'Gerente',
  CONSULTANT: 'Consultor',
  CLIENT: 'Cliente',
}

export default function ManageMembersModal({
  isOpen,
  onClose,
  projectId,
}: ManageMembersModalProps) {
  const { user: currentUser } = useAuth()

  // State para adicionar membro
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const [selectedModule, setSelectedModule] = useState<string>('')

  // Queries
  const { data: members, isLoading: isLoadingMembers } = useProjectMembers(projectId)
  const { data: availableUsers, isLoading: isLoadingUsers } = useAvailableUsers(projectId)

  // Mutations
  const addMemberMutation = useAddMember(projectId)
  const updateMemberMutation = useUpdateMember(projectId)
  const removeMemberMutation = useRemoveMember(projectId)

  // Reset state quando modal fecha
  useEffect(() => {
    if (!isOpen) {
      setSelectedUserId('')
      setSelectedModule('')
    }
  }, [isOpen])

  // Handler para adicionar membro
  const handleAddMember = () => {
    if (!selectedUserId) return

    addMemberMutation.mutate(
      {
        userId: selectedUserId,
        module: selectedModule || null,
      },
      {
        onSuccess: () => {
          setSelectedUserId('')
          setSelectedModule('')
        },
      }
    )
  }

  // Handler para atualizar módulo
  const handleUpdateModule = (userId: string, module: string | null) => {
    updateMemberMutation.mutate({ userId, data: { module } })
  }

  // Handler para remover membro
  const handleRemoveMember = (userId: string, userName: string) => {
    if (confirm(`Tem certeza que deseja remover ${userName} do projeto?`)) {
      removeMemberMutation.mutate(userId)
    }
  }

  // Não renderiza se fechado
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-2xl bg-white rounded-lg shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <div className="flex items-center gap-2">
              <svg
                className="w-6 h-6 text-gray-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"
                />
              </svg>
              <h2 className="text-lg font-semibold text-gray-900">
                Gerenciar Membros do Projeto
              </h2>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="p-4 space-y-6">
            {/* Seção: Adicionar Membro */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-3">
                Adicionar Membro
              </h3>
              <div className="flex flex-col sm:flex-row gap-3">
                {/* Select Usuário */}
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  disabled={isLoadingUsers || addMemberMutation.isPending}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                >
                  <option value="">
                    {isLoadingUsers ? 'Carregando...' : 'Selecione um usuário'}
                  </option>
                  {availableUsers?.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} ({user.email}) - {roleLabels[user.role] || user.role}
                    </option>
                  ))}
                </select>

                {/* Select Módulo */}
                <select
                  value={selectedModule}
                  onChange={(e) => setSelectedModule(e.target.value)}
                  disabled={addMemberMutation.isPending}
                  className="sm:w-48 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                >
                  <option value="">Sem módulo</option>
                  {SAP_MODULES.map((mod) => (
                    <option key={mod.value} value={mod.value}>
                      {mod.value}
                    </option>
                  ))}
                </select>

                {/* Botão Adicionar */}
                <button
                  onClick={handleAddMember}
                  disabled={!selectedUserId || addMemberMutation.isPending}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  {addMemberMutation.isPending ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                          fill="none"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                      <span>Adicionando...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 4v16m8-8H4"
                        />
                      </svg>
                      <span className="hidden sm:inline">Adicionar</span>
                    </>
                  )}
                </button>
              </div>
              {availableUsers?.length === 0 && !isLoadingUsers && (
                <p className="text-sm text-gray-500 mt-2">
                  Todos os usuários já são membros deste projeto.
                </p>
              )}
            </div>

            {/* Seção: Membros Atuais */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">
                Membros Atuais ({members?.length || 0})
              </h3>

              {isLoadingMembers ? (
                <div className="flex items-center justify-center py-8">
                  <svg className="animate-spin h-8 w-8 text-blue-600" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                </div>
              ) : members?.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">
                  Nenhum membro neste projeto.
                </p>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Usuário
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Módulo
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Role
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Ações
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {members?.map((member) => {
                        const isCurrentUser = member.userId === currentUser?.id
                        const initials = member.user.name
                          .split(' ')
                          .map((n) => n[0])
                          .join('')
                          .toUpperCase()
                          .slice(0, 2)

                        return (
                          <tr
                            key={member.id}
                            className={isCurrentUser ? 'bg-blue-50' : 'hover:bg-gray-50'}
                          >
                            {/* Usuário */}
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div
                                  className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium ${
                                    roleColors[member.user.role] || 'bg-gray-500'
                                  }`}
                                >
                                  {initials}
                                </div>
                                <div>
                                  <div className="text-sm font-medium text-gray-900">
                                    {member.user.name}
                                    {isCurrentUser && (
                                      <span className="ml-2 text-xs text-blue-600">(você)</span>
                                    )}
                                  </div>
                                  <div className="text-xs text-gray-500">{member.user.email}</div>
                                </div>
                              </div>
                            </td>

                            {/* Módulo (editável) */}
                            <td className="px-4 py-3">
                              <select
                                value={member.module || ''}
                                onChange={(e) =>
                                  handleUpdateModule(member.userId, e.target.value || null)
                                }
                                disabled={updateMemberMutation.isPending}
                                className="px-2 py-1 text-sm border border-gray-200 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                              >
                                <option value="">-</option>
                                {SAP_MODULES.map((mod) => (
                                  <option key={mod.value} value={mod.value}>
                                    {mod.value}
                                  </option>
                                ))}
                              </select>
                            </td>

                            {/* Role */}
                            <td className="px-4 py-3">
                              <span
                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                  member.user.role === 'ADMIN'
                                    ? 'bg-purple-100 text-purple-800'
                                    : member.user.role === 'MANAGER'
                                    ? 'bg-blue-100 text-blue-800'
                                    : member.user.role === 'CLIENT'
                                    ? 'bg-orange-100 text-orange-800'
                                    : 'bg-green-100 text-green-800'
                                }`}
                              >
                                {roleLabels[member.user.role] || member.user.role}
                              </span>
                            </td>

                            {/* Ações */}
                            <td className="px-4 py-3 text-right">
                              {!isCurrentUser && (
                                <button
                                  onClick={() =>
                                    handleRemoveMember(member.userId, member.user.name)
                                  }
                                  disabled={removeMemberMutation.isPending}
                                  className="text-red-500 hover:text-red-700 disabled:text-gray-300 transition-colors"
                                  title="Remover do projeto"
                                >
                                  <svg
                                    className="w-5 h-5"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                    />
                                  </svg>
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end p-4 border-t bg-gray-50">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
