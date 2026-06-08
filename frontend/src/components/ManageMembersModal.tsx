import { useState, useEffect } from 'react'
import {
  useProjectMembers,
  useAvailableUsers,
  useAddMember,
  useUpdateMember,
  useRemoveMember,
} from '../hooks/useProjectMembers'
import { useAuth } from '../contexts/AuthContext'
import { useProjectModules } from '../hooks/useProjectLists'
import { useProjectTerminology } from '../hooks/useProjectTerminology'
import { useCapabilities } from '../hooks/useCapabilities'

interface ManageMembersModalProps {
  isOpen: boolean
  onClose: () => void
  projectId: string
}

const roleColors: Record<string, string> = {
  ADMIN: 'bg-purple-500',
  MANAGER: 'bg-blue-500',
  CONSULTANT: 'bg-green-500',
  CLIENT: 'bg-orange-500',
}

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
  const { role: currentRole } = useCapabilities()
  const { data: projectModules = [] } = useProjectModules(projectId)
  const { moduleLabel } = useProjectTerminology(projectId)

  const assignableRoles = currentRole === 'ADMIN'
    ? ['ADMIN', 'MANAGER', 'CONSULTANT', 'CLIENT']
    : ['CONSULTANT', 'CLIENT']

  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const [email, setEmail] = useState<string>('')
  const [selectedRole, setSelectedRole] = useState<string>(assignableRoles[0] || 'CONSULTANT')
  const [selectedModule, setSelectedModule] = useState<string>('')

  const { data: membersResponse, isLoading: isLoadingMembers } = useProjectMembers(projectId)
  const { data: availableUsers, isLoading: isLoadingUsers } = useAvailableUsers(projectId)
  const members = membersResponse?.data || []
  const pendingAssignments = membersResponse?.pendingAssignments || []

  const addMemberMutation = useAddMember(projectId)
  const updateMemberMutation = useUpdateMember(projectId)
  const removeMemberMutation = useRemoveMember(projectId)

  useEffect(() => {
    if (!isOpen) {
      setSelectedUserId('')
      setEmail('')
      setSelectedRole(assignableRoles[0] || 'CONSULTANT')
      setSelectedModule('')
    }
  }, [assignableRoles, isOpen])

  const handleAddMember = () => {
    if (!selectedUserId && !email.trim()) return

    addMemberMutation.mutate(
      {
        userId: selectedUserId || undefined,
        email: email.trim() || undefined,
        role: selectedRole,
        module: selectedModule || null,
      },
      {
        onSuccess: () => {
          setSelectedUserId('')
          setEmail('')
          setSelectedRole(assignableRoles[0] || 'CONSULTANT')
          setSelectedModule('')
        },
      }
    )
  }

  const handleUpdateMember = (userId: string, data: { module?: string | null; role?: string }) => {
    updateMemberMutation.mutate({ userId, data })
  }

  const handleRemoveMember = (userId: string, userName: string) => {
    if (confirm(`Tem certeza que deseja remover ${userName} do projeto?`)) {
      removeMemberMutation.mutate(userId)
    }
  }

  const canManageMember = (member: typeof members[number]) => {
    if (!currentUser) return false

    if (currentRole === 'ADMIN') {
      return member.userId !== currentUser.id
    }

    if (currentRole === 'MANAGER') {
      if (member.userId === currentUser.id) return false
      return member.user.role === 'CONSULTANT' || member.user.role === 'CLIENT'
    }

    return false
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      />

      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-3xl bg-white rounded-lg shadow-xl">
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

          <div className="p-4 space-y-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-3">
                Adicionar Membro
              </h3>
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
                <select
                  value={selectedUserId}
                  onChange={(e) => {
                    setSelectedUserId(e.target.value)
                    if (e.target.value) {
                      setEmail('')
                      const selected = availableUsers?.find((user) => user.id === e.target.value)
                      if (selected) {
                        setSelectedRole(
                          assignableRoles.includes(selected.role) ? selected.role : assignableRoles[0]
                        )
                      }
                    }
                  }}
                  disabled={isLoadingUsers || addMemberMutation.isPending}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                >
                  <option value="">
                    {isLoadingUsers ? 'Carregando...' : 'Usuário existente'}
                  </option>
                  {availableUsers?.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} ({user.email}) - {roleLabels[user.role] || user.role}
                    </option>
                  ))}
                </select>

                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    if (e.target.value) setSelectedUserId('')
                  }}
                  disabled={addMemberMutation.isPending}
                  placeholder="ou e-mail ainda não cadastrado"
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                />

                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  disabled={addMemberMutation.isPending}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                >
                  {assignableRoles.map((role) => (
                    <option key={role} value={role}>
                      {roleLabels[role] || role}
                    </option>
                  ))}
                </select>

                <select
                  value={selectedModule}
                  onChange={(e) => setSelectedModule(e.target.value)}
                  disabled={addMemberMutation.isPending}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                >
                  <option value="">Sem {moduleLabel.toLowerCase()}</option>
                  {projectModules.map((mod) => (
                    <option key={mod.id} value={mod.code}>
                      {mod.code}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-3 flex justify-end">
                <button
                  onClick={handleAddMember}
                  disabled={(!selectedUserId && !email.trim()) || addMemberMutation.isPending}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  {addMemberMutation.isPending ? 'Salvando...' : 'Adicionar / Vincular'}
                </button>
              </div>
            </div>

            {pendingAssignments.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">
                  E-mails Vinculados ({pendingAssignments.length})
                </h3>
                <div className="space-y-2">
                  {pendingAssignments.map((assignment) => (
                    <div key={assignment.id} className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
                      <div>
                        <div className="font-medium text-gray-900">{assignment.email}</div>
                        <div className="text-xs text-gray-600">
                          {roleLabels[assignment.role] || assignment.role}
                          {assignment.module ? ` • ${assignment.module}` : ''}
                        </div>
                      </div>
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                        Pendente
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">
                Membros Atuais ({members.length})
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
              ) : members.length === 0 ? (
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
                          {moduleLabel}
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
                      {members.map((member) => {
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

                            <td className="px-4 py-3">
                              <select
                                value={member.module || ''}
                                onChange={(e) =>
                                  handleUpdateMember(member.userId, { module: e.target.value || null })
                                }
                                disabled={!canManageMember(member) || updateMemberMutation.isPending}
                                className="px-2 py-1 text-sm border border-gray-200 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                              >
                                <option value="">-</option>
                                {projectModules.map((mod) => (
                                  <option key={mod.id} value={mod.code}>
                                    {mod.code}
                                  </option>
                                ))}
                              </select>
                            </td>

                            <td className="px-4 py-3">
                              {canManageMember(member) ? (
                                <select
                                  value={member.user.role}
                                  onChange={(e) => handleUpdateMember(member.userId, { role: e.target.value })}
                                  disabled={updateMemberMutation.isPending}
                                  className="px-2 py-1 text-sm border border-gray-200 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                                >
                                  {assignableRoles.map((role) => (
                                    <option key={role} value={role}>
                                      {roleLabels[role] || role}
                                    </option>
                                  ))}
                                </select>
                              ) : (
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
                              )}
                            </td>

                            <td className="px-4 py-3 text-right">
                              {canManageMember(member) && (
                                <button
                                  onClick={() => handleRemoveMember(member.userId, member.user.name)}
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
