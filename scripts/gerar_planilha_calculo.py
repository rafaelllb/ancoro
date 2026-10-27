# Script para criar planilha de importação Ancoro a partir do Workshop 02 - Cálculo (SABESP)
# Fonte: Workshop 02_Calculo_Requirements_v2.xlsx
# Filtro: Exclui ação APAGAR, mantém MANTER/NOVO/DIRECIONAR
# Módulo: ISU-BILLING para todos (frente de Cálculo)
# ReqId: BPD ID (04.02.XX.YY) — requer configuração de projeto compatível no Ancoro

import openpyxl
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, Border, Side, PatternFill

INPUT_PATH = r'C:\Users\rafae\OneDrive\Documentos\Profissional-Rafael\SAP\SABESP\Workshop\Calculo\BPD\Validacao\posWSAcc\Workshop 02_Calculo_Requirements_v2.xlsx'
OUTPUT_PATH = r'C:\Users\rafae\OneDrive\Documentos\ancoro\requisitos_sabesp_calculo.xlsx'

# Mapeamento subprocesso → contexto para geração de 5W2H
SUBPROCESSO_CONTEXTO = {
    '04.01.01': {
        'when': 'A cada alteração tarifária aprovada pela ARSESP',
        'where': 'SAP ISU → Cadastro de Preços (EA26/EA27)',
        'who_default': 'Equipe Tarifária / Regulatório',
    },
    '04.02.02': {
        'when': 'Sob demanda, conforme contratos de reuso',
        'where': 'SAP ISU → Cálculo de Serviços',
        'who_default': 'Equipe de Faturamento',
    },
    '04.02.03': {
        'when': 'Mensalmente durante ciclo de faturamento',
        'where': 'SAP ISU → Cálculo de Taxas Regulatórias',
        'who_default': 'Sistema SAP ISU (batch de faturamento)',
    },
    '04.02.04': {
        'when': 'Quando período de consumo difere do ciclo padrão (30 dias)',
        'where': 'SAP ISU → Cálculo de Consumo Aperiódico',
        'who_default': 'Sistema SAP ISU (variante de cálculo)',
    },
    '04.02.05': {
        'when': 'Mensalmente durante ciclo de faturamento periódico',
        'where': 'SAP ISU → Cálculo do Consumo Periódico',
        'who_default': 'Sistema SAP ISU (batch de faturamento)',
    },
    '04.02.06': {
        'when': 'Mensalmente durante ciclo de faturamento',
        'where': 'SAP ISU → Cálculo de Consumo Baixa Renda',
        'who_default': 'Sistema SAP ISU (variante de cálculo)',
    },
    '04.02.07': {
        'when': 'Mensalmente ou sob demanda, conforme tipo de fonte',
        'where': 'SAP ISU → Cálculo de Fontes Alternativas',
        'who_default': 'Equipe de Faturamento / Sistema SAP ISU',
    },
    '04.02.08': {
        'when': 'Mensalmente, condicionado a critérios de metas/adimplência',
        'where': 'SAP ISU → Cálculo de Consumo - Outros',
        'who_default': 'Sistema SAP ISU (variante de cálculo)',
    },
    '04.02.09': {
        'when': 'Mensalmente durante ciclo de faturamento',
        'where': 'SAP ISU → Cálculo de Características Especiais',
        'who_default': 'Sistema SAP ISU (variante de cálculo)',
    },
    '04.02.10': {
        'when': 'Após leitura real que encerra período de estimativa',
        'where': 'SAP ISU → Compensação do Consumo Estimado',
        'who_default': 'Sistema SAP ISU (variante de compensação)',
    },
    '04.02.11': {
        'when': 'Mensalmente durante ciclo de faturamento',
        'where': 'SAP ISU → Configurações Especiais de Cálculo',
        'who_default': 'Sistema SAP ISU (variante de cálculo)',
    },
    '04.02.12': {
        'when': 'Conforme vigência de programas comerciais',
        'where': 'SAP ISU → Programas Comerciais',
        'who_default': 'Equipe Comercial / Sistema SAP ISU',
    },
    '04.02.13': {
        'when': 'Durante vigência de decreto de crise hídrica',
        'where': 'SAP ISU → Cálculo de Bônus/Ônus Hídrico',
        'who_default': 'Sistema SAP ISU (variante de cálculo)',
    },
    '04.02.14': {
        'when': 'Mensalmente, integrado ao ciclo de faturamento de esgoto',
        'where': 'SAP ISU → Cálculo de Fatores de Poluição (K1/K2)',
        'who_default': 'Equipe de Faturamento / Laboratório',
    },
}


def extrair_subprocesso_id(subprocesso):
    """Extrai o código do subprocesso: '04.02.11 - Configurações' → '04.02.11'"""
    if not subprocesso:
        return ''
    return subprocesso.split(' - ')[0].strip()


def gerar_short_desc(requerimento):
    """Gera descrição curta (max 50 chars) a partir do nome do requerimento."""
    text = (requerimento or '').strip()
    if len(text) <= 50:
        return text
    # Corta na última palavra que cabe em 47 chars + '...'
    truncated = text[:47]
    last_space = truncated.rfind(' ')
    if last_space > 20:
        truncated = truncated[:last_space]
    return truncated + '...'


def gerar_what(requerimento, observacoes, acao):
    """Gera campo WHAT: descrição detalhada do que precisa ser feito."""
    req = (requerimento or '').strip()
    obs = (observacoes or '').strip()

    # Base: o nome do requerimento expandido
    prefixo_acao = {
        'MANTER': 'Manter funcionalidade existente: ',
        'NOVO': 'Implementar nova funcionalidade: ',
        'DIRECIONAR': 'Direcionar para outra frente: ',
    }
    what = prefixo_acao.get(acao, '') + req

    # Adiciona observações se existem e trazem informação adicional
    if obs and obs.lower() != req.lower():
        what += f'. Detalhamento: {obs}'

    return what


def gerar_why(obrigatoriedade, mandatorio, producao, subprocesso_nome):
    """Gera campo WHY: justificativa de negócio."""
    obrig = (obrigatoriedade or '').strip()
    mand = (mandatorio or '').strip()
    prod = (producao or '').strip()
    sp_nome = (subprocesso_nome or '').strip()

    # Extrair nome do subprocesso sem código
    sp_descr = sp_nome.split(' - ')[1].strip() if ' - ' in sp_nome else sp_nome

    if obrig == 'Regulatório':
        why = f'Atendimento regulatório ARSESP para {sp_descr}'
        if mand == 'Sim':
            why += ' — requisito mandatório para operação'
    elif obrig == 'Funcional':
        why = f'Necessidade funcional para {sp_descr}'
        if mand == 'Sim':
            why += ' — essencial para operação em produção'
    else:
        why = f'Suporte ao processo de {sp_descr}'

    if prod == 'Não':
        why += '. Não obrigatório para Go-Live'

    return why


def gerar_who(acao, requerimento, ctx):
    """Gera campo WHO: quem executa a ação."""
    req_lower = (requerimento or '').lower()

    # Ações de cadastro/configuração → Equipe funcional
    if any(kw in req_lower for kw in ['cadastrar', 'configurar', 'definir', 'mapear']):
        return 'Equipe Funcional ISU / Consultoria'
    # Ações de cálculo automatizado → Sistema
    if any(kw in req_lower for kw in ['calcular', 'efetuar', 'pro ratear']):
        return ctx.get('who_default', 'Sistema SAP ISU (batch de faturamento)')
    # Ações de criação de programa/variante → Desenvolvimento
    if any(kw in req_lower for kw in ['criar', 'gerar', 'implementar']):
        return 'Equipe de Desenvolvimento ABAP'
    # Interface/integração
    if 'interface' in req_lower or 'integração' in req_lower:
        return 'Equipe de Integração / Basis'

    return ctx.get('who_default', 'Equipe de Faturamento')


def gerar_how_today(acao, requerimento, observacoes):
    """Gera campo HOW TODAY (As-Is): como funciona hoje."""
    req_lower = (requerimento or '').lower()

    if acao == 'NOVO':
        return 'Funcionalidade não existe no sistema atual. Necessita implementação nova no S/4HANA'
    elif acao == 'DIRECIONAR':
        obs = (observacoes or '').strip()
        base = 'Requisito identificado nesta frente mas pertence a outro escopo'
        if obs:
            base += f'. Nota: {obs}'
        return base
    else:
        # MANTER — processo existe no legado
        if any(kw in req_lower for kw in ['calcular', 'efetuar']):
            return 'Processo de cálculo existente no sistema legado. Deve ser reconfigurado no SAP S/4HANA ISU mantendo a mesma lógica de negócio'
        elif any(kw in req_lower for kw in ['customizar', 'configurar']):
            return 'Configuração existente no legado que precisa ser mapeada e replicada no SAP S/4HANA ISU com ajustes para nova arquitetura'
        elif any(kw in req_lower for kw in ['simular', 'validar']):
            return 'Funcionalidade de validação/simulação existente no legado. Reproduzir no S/4HANA para garantir integridade dos dados migrados'
        else:
            return 'Funcionalidade existente no sistema legado. Mapear regras de negócio e reconfigurar no SAP S/4HANA ISU'


def gerar_how_much(config_nivel, mandatorio, producao):
    """Gera campo HOW MUCH: volumetria/impacto/critério de aceitação."""
    config = (config_nivel or '').strip()
    mand = (mandatorio or '').strip()
    prod = (producao or '').strip()

    # Nível de esforço de configuração
    config_map = {
        'Muito Alta': 'Esforço de configuração muito alto — múltiplas variantes e regras complexas',
        'Alta': 'Esforço de configuração alto — envolve múltiplas regras de negócio',
        'Média': 'Esforço de configuração médio — regras de negócio moderadas',
        'Baixa': 'Esforço de configuração baixo — parametrização simples',
    }
    how_much = config_map.get(config, 'Esforço de configuração a ser estimado')

    if mand == 'Sim' and prod == 'Sim':
        how_much += '. Mandatório para produção'
    elif mand == 'Não' or prod == 'Não':
        how_much += '. Não mandatório para Go-Live — pode ser implementado em fase posterior'

    return how_much


def gerar_status(acao, fit_gap):
    """Determina status inicial baseado na ação e fit/gap."""
    if acao == 'DIRECIONAR':
        return 'PENDING'  # Precisa ser tratado por outra frente
    elif acao == 'NOVO' and fit_gap == 'Gap':
        return 'PENDING'  # Gap identificado, requer desenvolvimento
    else:
        return 'PENDING'  # Default seguro


def gerar_observacoes(row_data):
    """Gera campo de observações consolidando metadados da planilha original."""
    parts = []

    acao = row_data.get('acao', '')
    parts.append(f'Ação: {acao}')

    req_original = row_data.get('requirement', '')
    if req_original:
        parts.append(f'Req Original: {req_original}')

    fit_gap = (row_data.get('fit_gap', '') or '').strip()
    if fit_gap:
        parts.append(f'Fit/Gap: {fit_gap}')

    obrig = (row_data.get('obrigatoriedade', '') or '').strip()
    if obrig:
        parts.append(f'Tipo: {obrig}')

    origem = (row_data.get('origem', '') or '').strip()
    if origem:
        parts.append(f'Origem: {origem}')

    obs_original = (row_data.get('observacoes', '') or '').strip()
    if obs_original:
        parts.append(f'Obs: {obs_original}')

    return ' | '.join(parts)


def atribuir_bpd_ids_faltantes(requisitos):
    """
    Atribui BPD IDs para requisitos DIRECIONAR que não possuem ID.
    Gera sequencialmente dentro do subprocesso.
    """
    # Coletar IDs já usados por subprocesso
    usados = {}  # subprocesso_id → set de seq numbers
    for req in requisitos:
        bpd_id = req.get('bpd_id')
        sp_id = req.get('subprocesso_id', '')
        if bpd_id and sp_id:
            # Extrair último segmento como número
            parts = bpd_id.split('.')
            if len(parts) == 4:
                try:
                    seq = int(parts[3])
                    usados.setdefault(sp_id, set()).add(seq)
                except ValueError:
                    pass

    # Atribuir IDs faltantes
    for req in requisitos:
        if not req.get('bpd_id'):
            sp_id = req.get('subprocesso_id', '')
            existing = usados.get(sp_id, set())
            # Próximo número disponível
            next_seq = max(existing, default=0) + 1
            while next_seq in existing:
                next_seq += 1
            existing.add(next_seq)
            usados[sp_id] = existing
            req['bpd_id'] = f'{sp_id}.{next_seq:02d}'
            req['id_gerado'] = True  # Flag para observações


def main():
    print("Lendo Workshop 02_Calculo_Requirements_v2.xlsx...")
    wb = openpyxl.load_workbook(INPUT_PATH)
    ws = wb['Requerimentos']

    rows = list(ws.iter_rows(values_only=True))
    headers = rows[0]

    # Mapear índices dos headers (encoding pode variar)
    h_idx = {h: i for i, h in enumerate(headers) if h}

    # Extrair requisitos
    requisitos_raw = []
    for row in rows[1:]:
        data = dict(zip(headers, row))

        requirement = data.get('Requirement')
        if not requirement:
            continue

        # Coluna 'Ação' pode ter encoding diferente
        acao = str(row[7] or '').strip()

        # Filtrar APAGAR
        if acao == 'APAGAR':
            continue

        subprocesso = str(data.get('Subprocesso') or '').strip()
        sp_id = extrair_subprocesso_id(subprocesso)

        bpd_id = data.get('ID')
        if bpd_id:
            bpd_id = str(bpd_id).strip()
            if bpd_id == 'None':
                bpd_id = None

        requisitos_raw.append({
            'requirement': str(requirement).strip(),
            'bpd_id': bpd_id,
            'acao': acao,
            'requerimento': str(data.get('Requerimento') or '').strip(),
            'subprocesso': subprocesso,
            'subprocesso_id': sp_id,
            'origem': str(data.get('Origem') or '').strip(),
            'observacoes': str(row[10] or '').strip(),  # Observações
            'config': str(row[11] or '').strip(),       # Necessário Configuração
            'fit_gap': str(data.get('Fit/Gap') or '').strip(),
            'obrigatoriedade': str(row[13] or '').strip(),
            'mandatorio': str(row[14] or '').strip().replace('\n', ' '),
            'producao': str(row[15] or '').strip().replace('\n', ' '),
        })

    # Atribuir IDs faltantes
    atribuir_bpd_ids_faltantes(requisitos_raw)

    # Ordenar por BPD ID para coerência visual
    requisitos_raw.sort(key=lambda r: r.get('bpd_id', ''))

    print(f"Requisitos extraídos: {len(requisitos_raw)} (excluindo APAGAR)")

    # Contagem por ação
    from collections import Counter
    acoes = Counter(r['acao'] for r in requisitos_raw)
    for acao, count in acoes.most_common():
        print(f"  {acao}: {count}")

    # Criar planilha Ancoro
    wb_out = Workbook()
    ws_out = wb_out.active
    ws_out.title = "Requisitos"

    # Headers Ancoro (aliases PT-BR aceitos pelo importador)
    ancoro_headers = [
        'Req ID', 'Descrição', 'Módulo', 'O que', 'Por que',
        'Quem', 'Quando', 'Onde', 'Como Hoje', 'Quanto',
        'Depende De', 'Fornece Para', 'Status', 'Observações', 'Dúvidas'
    ]

    # Estilos
    header_font = Font(bold=True, color="FFFFFF", size=11)
    header_fill = PatternFill(start_color="2F5496", end_color="2F5496", fill_type="solid")
    thin_border = Border(
        left=Side(style='thin'),
        right=Side(style='thin'),
        top=Side(style='thin'),
        bottom=Side(style='thin')
    )
    wrap_align = Alignment(vertical='top', wrap_text=True)

    # Escrever headers
    for col, header in enumerate(ancoro_headers, 1):
        cell = ws_out.cell(row=1, column=col, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal='center', vertical='center')
        cell.border = thin_border

    # Popular dados
    for idx, req in enumerate(requisitos_raw):
        row_num = idx + 2
        sp_id = req['subprocesso_id']
        ctx = SUBPROCESSO_CONTEXTO.get(sp_id, {})

        # Campos 5W2H gerados a partir do contexto SAP ISU
        short_desc = gerar_short_desc(req['requerimento'])
        what = gerar_what(req['requerimento'], req['observacoes'], req['acao'])
        why = gerar_why(req['obrigatoriedade'], req['mandatorio'], req['producao'], req['subprocesso'])
        who = gerar_who(req['acao'], req['requerimento'], ctx)
        when = ctx.get('when', 'Mensalmente durante ciclo de faturamento')
        where = ctx.get('where', 'SAP ISU → Módulo de Cálculo')
        how_today = gerar_how_today(req['acao'], req['requerimento'], req['observacoes'])
        how_much = gerar_how_much(req['config'], req['mandatorio'], req['producao'])
        status = gerar_status(req['acao'], req['fit_gap'])
        observacoes = gerar_observacoes(req)

        # Dúvidas: sinalizar pontos que precisam de atenção
        duvidas = ''
        if req['acao'] == 'DIRECIONAR':
            duvidas = 'DIRECIONAR: Confirmar se escopo pertence a esta frente ou transferir formalmente'
        elif req.get('id_gerado'):
            duvidas = 'BPD ID gerado automaticamente — confirmar com equipe de documentação'

        dados = [
            req['bpd_id'],    # Req ID
            short_desc,        # Descrição
            'ISU-BILLING',     # Módulo
            what,              # O que
            why,               # Por que
            who,               # Quem
            when,              # Quando
            where,             # Onde
            how_today,         # Como Hoje
            how_much,          # Quanto
            '',                # Depende De
            '',                # Fornece Para
            status,            # Status
            observacoes,       # Observações
            duvidas,           # Dúvidas
        ]

        for col, valor in enumerate(dados, 1):
            cell = ws_out.cell(row=row_num, column=col, value=valor)
            cell.border = thin_border
            cell.alignment = wrap_align

    # Ajustar larguras das colunas
    column_widths = {
        'A': 14, 'B': 38, 'C': 14, 'D': 80, 'E': 55,
        'F': 35, 'G': 45, 'H': 45, 'I': 70, 'J': 55,
        'K': 15, 'L': 15, 'M': 12, 'N': 70, 'O': 55
    }

    for col_letter, width in column_widths.items():
        ws_out.column_dimensions[col_letter].width = width

    # Congelar header
    ws_out.freeze_panes = 'A2'

    # Salvar
    wb_out.save(OUTPUT_PATH)

    print(f"\nPlanilha criada: {OUTPUT_PATH}")
    print(f"Total: {len(requisitos_raw)} requisitos")
    print("\nPor subprocesso:")
    sp_count = Counter(r['subprocesso'] for r in requisitos_raw)
    for sp, count in sorted(sp_count.items()):
        print(f"  {sp}: {count}")

    # Listar requisitos sem BPD ID original
    sem_id = [r for r in requisitos_raw if r.get('id_gerado')]
    if sem_id:
        print(f"\nRequisitos com BPD ID gerado ({len(sem_id)}):")
        for r in sem_id:
            print(f"  {r['bpd_id']} <- {r['requirement']} ({r['acao']}): {r['requerimento'][:60]}")


if __name__ == '__main__':
    main()
