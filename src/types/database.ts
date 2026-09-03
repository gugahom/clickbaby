export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      caso_etapas: {
        Row: {
          atribuido_em: string | null
          atribuido_por: string | null
          baixou_por: string | null
          caso_id: string
          concluido_em: string | null
          created_at: string
          estacao: string | null
          id: string
          iniciado_em: string | null
          observacao: string | null
          ordem: number
          pausa_acumulada: string
          pausado_em: string | null
          previsao_em: string | null
          proximo_responsavel_id: string | null
          responsavel_id: string | null
          rodada: number
          status: Database["public"]["Enums"]["status_etapa"]
          subiu_por: string | null
          tipo: Database["public"]["Enums"]["etapa_tipo"]
          trilha: string | null
          updated_at: string
        }
        Insert: {
          atribuido_em?: string | null
          atribuido_por?: string | null
          baixou_por?: string | null
          caso_id: string
          concluido_em?: string | null
          created_at?: string
          estacao?: string | null
          id?: string
          iniciado_em?: string | null
          observacao?: string | null
          ordem?: number
          pausa_acumulada?: string
          pausado_em?: string | null
          previsao_em?: string | null
          proximo_responsavel_id?: string | null
          responsavel_id?: string | null
          rodada?: number
          status?: Database["public"]["Enums"]["status_etapa"]
          subiu_por?: string | null
          tipo: Database["public"]["Enums"]["etapa_tipo"]
          trilha?: string | null
          updated_at?: string
        }
        Update: {
          atribuido_em?: string | null
          atribuido_por?: string | null
          baixou_por?: string | null
          caso_id?: string
          concluido_em?: string | null
          created_at?: string
          estacao?: string | null
          id?: string
          iniciado_em?: string | null
          observacao?: string | null
          ordem?: number
          pausa_acumulada?: string
          pausado_em?: string | null
          previsao_em?: string | null
          proximo_responsavel_id?: string | null
          responsavel_id?: string | null
          rodada?: number
          status?: Database["public"]["Enums"]["status_etapa"]
          subiu_por?: string | null
          tipo?: Database["public"]["Enums"]["etapa_tipo"]
          trilha?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "caso_etapas_atribuido_por_fkey"
            columns: ["atribuido_por"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caso_etapas_baixou_por_fkey"
            columns: ["baixou_por"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caso_etapas_caso_id_fkey"
            columns: ["caso_id"]
            isOneToOne: false
            referencedRelation: "casos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caso_etapas_caso_id_fkey"
            columns: ["caso_id"]
            isOneToOne: false
            referencedRelation: "fila_edicao"
            referencedColumns: ["caso_id"]
          },
          {
            foreignKeyName: "caso_etapas_caso_id_fkey"
            columns: ["caso_id"]
            isOneToOne: false
            referencedRelation: "quadro_casos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caso_etapas_proximo_responsavel_id_fkey"
            columns: ["proximo_responsavel_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caso_etapas_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caso_etapas_subiu_por_fkey"
            columns: ["subiu_por"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
        ]
      }
      casos: {
        Row: {
          bebe_nome: string | null
          cor_calendar: string | null
          created_at: string
          criado_por: string | null
          google_calendar_event_id: string | null
          id: string
          mae_nome: string
          maternidade_id: string | null
          motivo_cancelamento: string | null
          observacao: string | null
          pacote_id: string | null
          previsao_em: string | null
          reaberto_em: string | null
          situacao_clinica: Database["public"]["Enums"]["situacao_clinica"]
          status_entrega: Database["public"]["Enums"]["status_entrega"]
          status_operacional: Database["public"]["Enums"]["status_operacional"]
          termo_status: Database["public"]["Enums"]["termo_status"]
          updated_at: string
          uti_acumulada: string
          uti_desde: string | null
        }
        Insert: {
          bebe_nome?: string | null
          cor_calendar?: string | null
          created_at?: string
          criado_por?: string | null
          google_calendar_event_id?: string | null
          id?: string
          mae_nome: string
          maternidade_id?: string | null
          motivo_cancelamento?: string | null
          observacao?: string | null
          pacote_id?: string | null
          previsao_em?: string | null
          reaberto_em?: string | null
          situacao_clinica?: Database["public"]["Enums"]["situacao_clinica"]
          status_entrega?: Database["public"]["Enums"]["status_entrega"]
          status_operacional?: Database["public"]["Enums"]["status_operacional"]
          termo_status?: Database["public"]["Enums"]["termo_status"]
          updated_at?: string
          uti_acumulada?: string
          uti_desde?: string | null
        }
        Update: {
          bebe_nome?: string | null
          cor_calendar?: string | null
          created_at?: string
          criado_por?: string | null
          google_calendar_event_id?: string | null
          id?: string
          mae_nome?: string
          maternidade_id?: string | null
          motivo_cancelamento?: string | null
          observacao?: string | null
          pacote_id?: string | null
          previsao_em?: string | null
          reaberto_em?: string | null
          situacao_clinica?: Database["public"]["Enums"]["situacao_clinica"]
          status_entrega?: Database["public"]["Enums"]["status_entrega"]
          status_operacional?: Database["public"]["Enums"]["status_operacional"]
          termo_status?: Database["public"]["Enums"]["termo_status"]
          updated_at?: string
          uti_acumulada?: string
          uti_desde?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "casos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "casos_maternidade_id_fkey"
            columns: ["maternidade_id"]
            isOneToOne: false
            referencedRelation: "maternidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "casos_pacote_id_fkey"
            columns: ["pacote_id"]
            isOneToOne: false
            referencedRelation: "pacotes"
            referencedColumns: ["id"]
          },
        ]
      }
      entregaveis: {
        Row: {
          caso_id: string
          confirmado_em: string | null
          confirmado_por: string | null
          created_at: string
          criado_em: string
          criado_por: string | null
          id: string
          tipo: Database["public"]["Enums"]["tipo_entregavel"]
          updated_at: string
          url: string
        }
        Insert: {
          caso_id: string
          confirmado_em?: string | null
          confirmado_por?: string | null
          created_at?: string
          criado_em?: string
          criado_por?: string | null
          id?: string
          tipo: Database["public"]["Enums"]["tipo_entregavel"]
          updated_at?: string
          url: string
        }
        Update: {
          caso_id?: string
          confirmado_em?: string | null
          confirmado_por?: string | null
          created_at?: string
          criado_em?: string
          criado_por?: string | null
          id?: string
          tipo?: Database["public"]["Enums"]["tipo_entregavel"]
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "entregaveis_caso_id_fkey"
            columns: ["caso_id"]
            isOneToOne: false
            referencedRelation: "casos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entregaveis_caso_id_fkey"
            columns: ["caso_id"]
            isOneToOne: false
            referencedRelation: "fila_edicao"
            referencedColumns: ["caso_id"]
          },
          {
            foreignKeyName: "entregaveis_caso_id_fkey"
            columns: ["caso_id"]
            isOneToOne: false
            referencedRelation: "quadro_casos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entregaveis_confirmado_por_fkey"
            columns: ["confirmado_por"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entregaveis_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
        ]
      }
      escalas: {
        Row: {
          created_at: string
          data: string
          fim: string
          id: string
          inicio: string
          pessoa_id: string
          turno: Database["public"]["Enums"]["turno"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          data: string
          fim: string
          id?: string
          inicio: string
          pessoa_id: string
          turno: Database["public"]["Enums"]["turno"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: string
          fim?: string
          id?: string
          inicio?: string
          pessoa_id?: string
          turno?: Database["public"]["Enums"]["turno"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "escalas_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
        ]
      }
      eventos: {
        Row: {
          caso_etapa_id: string | null
          caso_id: string | null
          created_at: string
          device_id: string | null
          id: string
          ocorrido_em: string
          payload: Json
          pessoa_id: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          caso_etapa_id?: string | null
          caso_id?: string | null
          created_at?: string
          device_id?: string | null
          id?: string
          ocorrido_em?: string
          payload?: Json
          pessoa_id?: string | null
          tipo: string
          updated_at?: string
        }
        Update: {
          caso_etapa_id?: string | null
          caso_id?: string | null
          created_at?: string
          device_id?: string | null
          id?: string
          ocorrido_em?: string
          payload?: Json
          pessoa_id?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "eventos_caso_etapa_id_fkey"
            columns: ["caso_etapa_id"]
            isOneToOne: false
            referencedRelation: "caso_etapas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventos_caso_etapa_id_fkey"
            columns: ["caso_etapa_id"]
            isOneToOne: false
            referencedRelation: "fila_edicao"
            referencedColumns: ["caso_etapa_id"]
          },
          {
            foreignKeyName: "eventos_caso_id_fkey"
            columns: ["caso_id"]
            isOneToOne: false
            referencedRelation: "casos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventos_caso_id_fkey"
            columns: ["caso_id"]
            isOneToOne: false
            referencedRelation: "fila_edicao"
            referencedColumns: ["caso_id"]
          },
          {
            foreignKeyName: "eventos_caso_id_fkey"
            columns: ["caso_id"]
            isOneToOne: false
            referencedRelation: "quadro_casos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventos_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
        ]
      }
      feriados: {
        Row: {
          created_at: string
          data: string
          descricao: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data: string
          descricao: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: string
          descricao?: string
          updated_at?: string
        }
        Relationships: []
      }
      handoffs: {
        Row: {
          caso_etapa_id: string
          created_at: string
          de_pessoa_id: string | null
          id: string
          motivo: string | null
          ocorrido_em: string
          para_pessoa_id: string
          updated_at: string
        }
        Insert: {
          caso_etapa_id: string
          created_at?: string
          de_pessoa_id?: string | null
          id?: string
          motivo?: string | null
          ocorrido_em?: string
          para_pessoa_id: string
          updated_at?: string
        }
        Update: {
          caso_etapa_id?: string
          created_at?: string
          de_pessoa_id?: string | null
          id?: string
          motivo?: string | null
          ocorrido_em?: string
          para_pessoa_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "handoffs_caso_etapa_id_fkey"
            columns: ["caso_etapa_id"]
            isOneToOne: false
            referencedRelation: "caso_etapas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handoffs_caso_etapa_id_fkey"
            columns: ["caso_etapa_id"]
            isOneToOne: false
            referencedRelation: "fila_edicao"
            referencedColumns: ["caso_etapa_id"]
          },
          {
            foreignKeyName: "handoffs_de_pessoa_id_fkey"
            columns: ["de_pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handoffs_para_pessoa_id_fkey"
            columns: ["para_pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
        ]
      }
      maternidades: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          sigla: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          sigla: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          sigla?: string
          updated_at?: string
        }
        Relationships: []
      }
      pacote_etapas: {
        Row: {
          created_at: string
          etapa_tipo: Database["public"]["Enums"]["etapa_tipo"]
          id: string
          obrigatoria: boolean
          ordem: number
          pacote_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          etapa_tipo: Database["public"]["Enums"]["etapa_tipo"]
          id?: string
          obrigatoria?: boolean
          ordem: number
          pacote_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          etapa_tipo?: Database["public"]["Enums"]["etapa_tipo"]
          id?: string
          obrigatoria?: boolean
          ordem?: number
          pacote_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pacote_etapas_pacote_id_fkey"
            columns: ["pacote_id"]
            isOneToOne: false
            referencedRelation: "pacotes"
            referencedColumns: ["id"]
          },
        ]
      }
      pacotes: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          prazo_dias_uteis: number | null
          prazo_entrega: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          prazo_dias_uteis?: number | null
          prazo_entrega?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          prazo_dias_uteis?: number | null
          prazo_entrega?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      padroes_tempo: {
        Row: {
          created_at: string
          etapa_tipo: Database["public"]["Enums"]["etapa_tipo"]
          id: string
          minutos_esperados: number
          pacote_id: string | null
          updated_at: string
          vigente_desde: string
        }
        Insert: {
          created_at?: string
          etapa_tipo: Database["public"]["Enums"]["etapa_tipo"]
          id?: string
          minutos_esperados: number
          pacote_id?: string | null
          updated_at?: string
          vigente_desde: string
        }
        Update: {
          created_at?: string
          etapa_tipo?: Database["public"]["Enums"]["etapa_tipo"]
          id?: string
          minutos_esperados?: number
          pacote_id?: string | null
          updated_at?: string
          vigente_desde?: string
        }
        Relationships: [
          {
            foreignKeyName: "padroes_tempo_pacote_id_fkey"
            columns: ["pacote_id"]
            isOneToOne: false
            referencedRelation: "pacotes"
            referencedColumns: ["id"]
          },
        ]
      }
      pessoas: {
        Row: {
          apelidos: string[]
          ativo: boolean
          auth_user_id: string | null
          created_at: string
          foto_path: string | null
          id: string
          nome: string
          papel_sistema: Database["public"]["Enums"]["papel_sistema"]
          pin_hash: string | null
          updated_at: string
        }
        Insert: {
          apelidos?: string[]
          ativo?: boolean
          auth_user_id?: string | null
          created_at?: string
          foto_path?: string | null
          id?: string
          nome: string
          papel_sistema?: Database["public"]["Enums"]["papel_sistema"]
          pin_hash?: string | null
          updated_at?: string
        }
        Update: {
          apelidos?: string[]
          ativo?: boolean
          auth_user_id?: string | null
          created_at?: string
          foto_path?: string | null
          id?: string
          nome?: string
          papel_sistema?: Database["public"]["Enums"]["papel_sistema"]
          pin_hash?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      fila_edicao: {
        Row: {
          atribuido_em: string | null
          atribuido_por_nome: string | null
          bebe_nome: string | null
          caso_etapa_id: string | null
          caso_id: string | null
          cor_calendar: string | null
          dia: string | null
          estacao: string | null
          etapa_status: Database["public"]["Enums"]["status_etapa"] | null
          etapa_tipo: Database["public"]["Enums"]["etapa_tipo"] | null
          iniciado_em: string | null
          mae_nome: string | null
          maternidade_sigla: string | null
          na_uti: boolean | null
          pacote_nome: string | null
          pausa_acumulada: string | null
          pausado_em: string | null
          prazo_entrega_horas: number | null
          responsavel_id: string | null
          responsavel_nome: string | null
          sla_pausado: boolean | null
          vence_em: string | null
        }
        Relationships: [
          {
            foreignKeyName: "caso_etapas_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
        ]
      }
      quadro_casos: {
        Row: {
          bebe_nome: string | null
          cor_calendar: string | null
          created_at: string | null
          dia: string | null
          eh_rascunho: boolean | null
          eh_terminal: boolean | null
          etapas_concluidas: number | null
          etapas_total: number | null
          falta_maternidade: boolean | null
          falta_pacote: boolean | null
          id: string | null
          mae_nome: string | null
          maternidade_id: string | null
          maternidade_nome: string | null
          maternidade_sigla: string | null
          na_uti: boolean | null
          nascimento_concluido_em: string | null
          observacao: string | null
          pacote_id: string | null
          pacote_nome: string | null
          pacote_slug: string | null
          prazo_dias_uteis: number | null
          prazo_entrega_horas: number | null
          prazo_total_horas: number | null
          previsao_em: string | null
          reaberto_em: string | null
          situacao_clinica:
            | Database["public"]["Enums"]["situacao_clinica"]
            | null
          sla_pausado: boolean | null
          status_entrega: Database["public"]["Enums"]["status_entrega"] | null
          status_operacional:
            | Database["public"]["Enums"]["status_operacional"]
            | null
          termo_status: Database["public"]["Enums"]["termo_status"] | null
          updated_at: string | null
          uti_desde: string | null
          uti_horas_total: number | null
          vence_em: string | null
        }
        Relationships: [
          {
            foreignKeyName: "casos_maternidade_id_fkey"
            columns: ["maternidade_id"]
            isOneToOne: false
            referencedRelation: "maternidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "casos_pacote_id_fkey"
            columns: ["pacote_id"]
            isOneToOne: false
            referencedRelation: "pacotes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      adicionar_etapa: {
        Args: {
          p_caso_id: string
          p_tipo: Database["public"]["Enums"]["etapa_tipo"]
        }
        Returns: boolean
      }
      agendar_etapa: {
        Args: { p_caso_etapa_id: string; p_previsao_em: string }
        Returns: undefined
      }
      anotar_etapa: {
        Args: { p_caso_etapa_id: string; p_observacao: string }
        Returns: undefined
      }
      atribuir_etapa: {
        Args: { p_caso_etapa_id: string; p_para_pessoa_id: string }
        Returns: undefined
      }
      cancelar_caso: {
        Args: { p_caso_id: string; p_motivo: string }
        Returns: undefined
      }
      concluir_etapa: {
        Args: { p_caso_etapa_id: string; p_observacao?: string }
        Returns: undefined
      }
      configurar_segredo_do_sync: {
        Args: { p_nome: string; p_valor: string }
        Returns: string
      }
      confirmar_entrega: { Args: { p_caso_id: string }; Returns: undefined }
      definir_minha_foto: { Args: { p_foto_path: string }; Returns: undefined }
      disparar_sync_calendar: { Args: never; Returns: string }
      dispensar_etapa: {
        Args: { p_caso_etapa_id: string; p_motivo?: string }
        Returns: undefined
      }
      eh_adm: { Args: never; Returns: boolean }
      eh_atendimento: { Args: never; Returns: boolean }
      eh_pessoa_ativa: { Args: never; Returns: boolean }
      iniciar_etapa: { Args: { p_caso_etapa_id: string }; Returns: undefined }
      mover_para_uti: { Args: { p_caso_id: string }; Returns: undefined }
      mover_video_master: {
        Args: {
          p_caso_etapa_id: string
          p_fase: Database["public"]["Enums"]["status_etapa"]
        }
        Returns: undefined
      }
      ordem_padrao_da_etapa: {
        Args: { p_tipo: Database["public"]["Enums"]["etapa_tipo"] }
        Returns: number
      }
      pausar_etapa: { Args: { p_caso_etapa_id: string }; Returns: undefined }
      planejar_rendicao: {
        Args: { p_caso_etapa_id: string; p_proxima_pessoa_id: string }
        Returns: undefined
      }
      reabrir_caso: {
        Args: {
          p_caso_id: string
          p_etapas: Database["public"]["Enums"]["etapa_tipo"][]
          p_motivo: string
        }
        Returns: undefined
      }
      reabrir_etapa: {
        Args: { p_caso_etapa_id: string; p_motivo?: string }
        Returns: undefined
      }
      registrar_entregavel: {
        Args: {
          p_caso_id: string
          p_tipo: Database["public"]["Enums"]["tipo_entregavel"]
          p_url: string
        }
        Returns: undefined
      }
      registrar_estacao: {
        Args: { p_caso_etapa_id: string; p_estacao: string }
        Returns: undefined
      }
      retornar_da_uti: { Args: { p_caso_id: string }; Returns: undefined }
      somar_dias_uteis: {
        Args: { p_dias: number; p_inicio: string }
        Returns: string
      }
      sync_cancelar_caso: {
        Args: { p_google_event_id: string; p_motivo?: string }
        Returns: string
      }
      sync_upsert_caso: {
        Args: {
          p_bebe_nome: string
          p_cancelado: boolean
          p_cor_calendar: string
          p_google_event_id: string
          p_mae_nome: string
          p_maternidade_id: string
          p_pacote_id: string
          p_previsao_em: string
        }
        Returns: string
      }
      tipo_tem_segunda_rodada: {
        Args: { p_tipo: Database["public"]["Enums"]["etapa_tipo"] }
        Returns: boolean
      }
      transferir_etapa: {
        Args: {
          p_caso_etapa_id: string
          p_motivo?: string
          p_para_pessoa_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      etapa_tipo:
        | "entrada"
        | "nascimento"
        | "banho"
        | "fechamento"
        | "edicao_foto"
        | "edicao_video"
        | "reels"
        | "album"
        | "encontro_irmaos"
        | "saida_uti"
        | "alta"
      papel_sistema:
        | "operador"
        | "comercial"
        | "coordenacao"
        | "atendimento"
        | "financeiro"
        | "gestao"
      situacao_clinica:
        | "aguardando"
        | "internada"
        | "inducao"
        | "trabalho_parto"
        | "nasceu"
        | "uti"
        | "alta"
      status_entrega: "pendente" | "links_prontos" | "confirmado"
      status_etapa:
        | "pendente"
        | "atribuida"
        | "em_andamento"
        | "concluida"
        | "dispensada"
        | "pausada"
        | "em_alteracao"
        | "pronto_para_entrega"
      status_operacional:
        | "agendado"
        | "em_atendimento"
        | "em_edicao"
        | "aguardando_entrega"
        | "encerrado"
        | "cancelado"
      termo_status: "assinado" | "pendente" | "sem_contrato" | "nao_aplicavel"
      tipo_entregavel:
        | "google_photos"
        | "wetransfer"
        | "cadeado"
        | "reels"
        | "album"
      turno: "diurno" | "noturno" | "comercial"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      etapa_tipo: [
        "entrada",
        "nascimento",
        "banho",
        "fechamento",
        "edicao_foto",
        "edicao_video",
        "reels",
        "album",
        "encontro_irmaos",
        "saida_uti",
        "alta",
      ],
      papel_sistema: [
        "operador",
        "comercial",
        "coordenacao",
        "atendimento",
        "financeiro",
        "gestao",
      ],
      situacao_clinica: [
        "aguardando",
        "internada",
        "inducao",
        "trabalho_parto",
        "nasceu",
        "uti",
        "alta",
      ],
      status_entrega: ["pendente", "links_prontos", "confirmado"],
      status_etapa: [
        "pendente",
        "atribuida",
        "em_andamento",
        "concluida",
        "dispensada",
        "pausada",
        "em_alteracao",
        "pronto_para_entrega",
      ],
      status_operacional: [
        "agendado",
        "em_atendimento",
        "em_edicao",
        "aguardando_entrega",
        "encerrado",
        "cancelado",
      ],
      termo_status: ["assinado", "pendente", "sem_contrato", "nao_aplicavel"],
      tipo_entregavel: [
        "google_photos",
        "wetransfer",
        "cadeado",
        "reels",
        "album",
      ],
      turno: ["diurno", "noturno", "comercial"],
    },
  },
} as const

