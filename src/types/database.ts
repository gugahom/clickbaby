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
          cartao_foto: string | null
          cartao_video: string | null
          caso_id: string
          concluido_em: string | null
          created_at: string
          estacao: string | null
          fase_album: Database["public"]["Enums"]["fase_album"] | null
          fase_campo: Database["public"]["Enums"]["fase_de_campo"] | null
          fase_campo_em: string | null
          fase_click_home: Database["public"]["Enums"]["fase_click_home"] | null
          fotolivro_capa: string | null
          fotolivro_enviado_em: string | null
          fotolivro_enviado_por: string | null
          fotolivro_link: string | null
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
          video_nos_links_do_caso_em: string | null
        }
        Insert: {
          atribuido_em?: string | null
          atribuido_por?: string | null
          baixou_por?: string | null
          cartao_foto?: string | null
          cartao_video?: string | null
          caso_id: string
          concluido_em?: string | null
          created_at?: string
          estacao?: string | null
          fase_album?: Database["public"]["Enums"]["fase_album"] | null
          fase_campo?: Database["public"]["Enums"]["fase_de_campo"] | null
          fase_campo_em?: string | null
          fase_click_home?:
            | Database["public"]["Enums"]["fase_click_home"]
            | null
          fotolivro_capa?: string | null
          fotolivro_enviado_em?: string | null
          fotolivro_enviado_por?: string | null
          fotolivro_link?: string | null
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
          video_nos_links_do_caso_em?: string | null
        }
        Update: {
          atribuido_em?: string | null
          atribuido_por?: string | null
          baixou_por?: string | null
          cartao_foto?: string | null
          cartao_video?: string | null
          caso_id?: string
          concluido_em?: string | null
          created_at?: string
          estacao?: string | null
          fase_album?: Database["public"]["Enums"]["fase_album"] | null
          fase_campo?: Database["public"]["Enums"]["fase_de_campo"] | null
          fase_campo_em?: string | null
          fase_click_home?:
            | Database["public"]["Enums"]["fase_click_home"]
            | null
          fotolivro_capa?: string | null
          fotolivro_enviado_em?: string | null
          fotolivro_enviado_por?: string | null
          fotolivro_link?: string | null
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
          video_nos_links_do_caso_em?: string | null
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
            referencedRelation: "despesas_por_caso"
            referencedColumns: ["caso_id"]
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
            referencedRelation: "operacao_dos_casos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caso_etapas_caso_id_fkey"
            columns: ["caso_id"]
            isOneToOne: false
            referencedRelation: "quadro_casos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caso_etapas_fotolivro_enviado_por_fkey"
            columns: ["fotolivro_enviado_por"]
            isOneToOne: false
            referencedRelation: "pessoas"
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
          avaliacao_em: string | null
          avaliacao_por: string | null
          bebe_nome: string | null
          cesarea_em: string | null
          click_home: boolean
          cor_calendar: string | null
          created_at: string
          criado_por: string | null
          encerrado_em: string | null
          google_calendar_event_id: string | null
          google_desatualizado: boolean
          google_escrito_em: string | null
          google_pendente: boolean
          google_versao: number
          id: string
          liberado_para_entrega_em: string | null
          liberado_para_entrega_por: string | null
          mae_nome: string
          maternidade_id: string | null
          motivo_cancelamento: string | null
          observacao: string | null
          observacao_calendar: string | null
          pacote_id: string | null
          previsao_em: string | null
          previsao_sem_hora: boolean
          reaberto_em: string | null
          situacao_clinica: Database["public"]["Enums"]["situacao_clinica"]
          status_entrega: Database["public"]["Enums"]["status_entrega"]
          status_operacional: Database["public"]["Enums"]["status_operacional"]
          termo_status: Database["public"]["Enums"]["termo_status"] | null
          updated_at: string
          uti_acumulada: string
          uti_desde: string | null
        }
        Insert: {
          avaliacao_em?: string | null
          avaliacao_por?: string | null
          bebe_nome?: string | null
          cesarea_em?: string | null
          click_home?: boolean
          cor_calendar?: string | null
          created_at?: string
          criado_por?: string | null
          encerrado_em?: string | null
          google_calendar_event_id?: string | null
          google_desatualizado?: boolean
          google_escrito_em?: string | null
          google_pendente?: boolean
          google_versao?: number
          id?: string
          liberado_para_entrega_em?: string | null
          liberado_para_entrega_por?: string | null
          mae_nome: string
          maternidade_id?: string | null
          motivo_cancelamento?: string | null
          observacao?: string | null
          observacao_calendar?: string | null
          pacote_id?: string | null
          previsao_em?: string | null
          previsao_sem_hora?: boolean
          reaberto_em?: string | null
          situacao_clinica?: Database["public"]["Enums"]["situacao_clinica"]
          status_entrega?: Database["public"]["Enums"]["status_entrega"]
          status_operacional?: Database["public"]["Enums"]["status_operacional"]
          termo_status?: Database["public"]["Enums"]["termo_status"] | null
          updated_at?: string
          uti_acumulada?: string
          uti_desde?: string | null
        }
        Update: {
          avaliacao_em?: string | null
          avaliacao_por?: string | null
          bebe_nome?: string | null
          cesarea_em?: string | null
          click_home?: boolean
          cor_calendar?: string | null
          created_at?: string
          criado_por?: string | null
          encerrado_em?: string | null
          google_calendar_event_id?: string | null
          google_desatualizado?: boolean
          google_escrito_em?: string | null
          google_pendente?: boolean
          google_versao?: number
          id?: string
          liberado_para_entrega_em?: string | null
          liberado_para_entrega_por?: string | null
          mae_nome?: string
          maternidade_id?: string | null
          motivo_cancelamento?: string | null
          observacao?: string | null
          observacao_calendar?: string | null
          pacote_id?: string | null
          previsao_em?: string | null
          previsao_sem_hora?: boolean
          reaberto_em?: string | null
          situacao_clinica?: Database["public"]["Enums"]["situacao_clinica"]
          status_entrega?: Database["public"]["Enums"]["status_entrega"]
          status_operacional?: Database["public"]["Enums"]["status_operacional"]
          termo_status?: Database["public"]["Enums"]["termo_status"] | null
          updated_at?: string
          uti_acumulada?: string
          uti_desde?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "casos_avaliacao_por_fkey"
            columns: ["avaliacao_por"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "casos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "casos_liberado_para_entrega_por_fkey"
            columns: ["liberado_para_entrega_por"]
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
      despesas: {
        Row: {
          caso_id: string
          created_at: string
          descricao: string | null
          id: string
          momento: Database["public"]["Enums"]["momento_despesa"] | null
          pessoa_id: string
          registrado_em: string
          registrado_por: string
          tipo: Database["public"]["Enums"]["tipo_despesa"]
          updated_at: string
          valor: number
        }
        Insert: {
          caso_id: string
          created_at?: string
          descricao?: string | null
          id?: string
          momento?: Database["public"]["Enums"]["momento_despesa"] | null
          pessoa_id: string
          registrado_em?: string
          registrado_por: string
          tipo: Database["public"]["Enums"]["tipo_despesa"]
          updated_at?: string
          valor: number
        }
        Update: {
          caso_id?: string
          created_at?: string
          descricao?: string | null
          id?: string
          momento?: Database["public"]["Enums"]["momento_despesa"] | null
          pessoa_id?: string
          registrado_em?: string
          registrado_por?: string
          tipo?: Database["public"]["Enums"]["tipo_despesa"]
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "despesas_caso_id_fkey"
            columns: ["caso_id"]
            isOneToOne: false
            referencedRelation: "casos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "despesas_caso_id_fkey"
            columns: ["caso_id"]
            isOneToOne: false
            referencedRelation: "despesas_por_caso"
            referencedColumns: ["caso_id"]
          },
          {
            foreignKeyName: "despesas_caso_id_fkey"
            columns: ["caso_id"]
            isOneToOne: false
            referencedRelation: "fila_edicao"
            referencedColumns: ["caso_id"]
          },
          {
            foreignKeyName: "despesas_caso_id_fkey"
            columns: ["caso_id"]
            isOneToOne: false
            referencedRelation: "operacao_dos_casos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "despesas_caso_id_fkey"
            columns: ["caso_id"]
            isOneToOne: false
            referencedRelation: "quadro_casos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "despesas_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "despesas_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "pessoas"
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
            referencedRelation: "despesas_por_caso"
            referencedColumns: ["caso_id"]
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
            referencedRelation: "operacao_dos_casos"
            referencedColumns: ["id"]
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
            referencedRelation: "despesas_por_caso"
            referencedColumns: ["caso_id"]
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
            referencedRelation: "operacao_dos_casos"
            referencedColumns: ["id"]
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
          cor_calendar: string | null
          created_at: string
          id: string
          nome: string
          sigla: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cor_calendar?: string | null
          created_at?: string
          id?: string
          nome: string
          sigla: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cor_calendar?: string | null
          created_at?: string
          id?: string
          nome?: string
          sigla?: string
          updated_at?: string
        }
        Relationships: []
      }
      notificacoes_vistas: {
        Row: {
          created_at: string
          gerais_limpas_em: string | null
          pessoa_id: string
          updated_at: string
          visto_em: string
        }
        Insert: {
          created_at?: string
          gerais_limpas_em?: string | null
          pessoa_id: string
          updated_at?: string
          visto_em?: string
        }
        Update: {
          created_at?: string
          gerais_limpas_em?: string | null
          pessoa_id?: string
          updated_at?: string
          visto_em?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificacoes_vistas_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: true
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
        ]
      }
      ofertas_comerciais: {
        Row: {
          atualizado_em: string
          atualizado_por: string
          caso_id: string
          created_at: string
          fase: Database["public"]["Enums"]["fase_comercial"]
          id: string
          oferta: Database["public"]["Enums"]["oferta_comercial"]
          updated_at: string
        }
        Insert: {
          atualizado_em?: string
          atualizado_por: string
          caso_id: string
          created_at?: string
          fase: Database["public"]["Enums"]["fase_comercial"]
          id?: string
          oferta: Database["public"]["Enums"]["oferta_comercial"]
          updated_at?: string
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string
          caso_id?: string
          created_at?: string
          fase?: Database["public"]["Enums"]["fase_comercial"]
          id?: string
          oferta?: Database["public"]["Enums"]["oferta_comercial"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ofertas_comerciais_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ofertas_comerciais_caso_id_fkey"
            columns: ["caso_id"]
            isOneToOne: false
            referencedRelation: "casos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ofertas_comerciais_caso_id_fkey"
            columns: ["caso_id"]
            isOneToOne: false
            referencedRelation: "despesas_por_caso"
            referencedColumns: ["caso_id"]
          },
          {
            foreignKeyName: "ofertas_comerciais_caso_id_fkey"
            columns: ["caso_id"]
            isOneToOne: false
            referencedRelation: "fila_edicao"
            referencedColumns: ["caso_id"]
          },
          {
            foreignKeyName: "ofertas_comerciais_caso_id_fkey"
            columns: ["caso_id"]
            isOneToOne: false
            referencedRelation: "operacao_dos_casos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ofertas_comerciais_caso_id_fkey"
            columns: ["caso_id"]
            isOneToOne: false
            referencedRelation: "quadro_casos"
            referencedColumns: ["id"]
          },
        ]
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
          cor_calendar: string | null
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
          cor_calendar?: string | null
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
          cor_calendar?: string | null
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
          telas: Database["public"]["Enums"]["tela"][] | null
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
          telas?: Database["public"]["Enums"]["tela"][] | null
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
          telas?: Database["public"]["Enums"]["tela"][] | null
          updated_at?: string
        }
        Relationships: []
      }
      pontos_por_item: {
        Row: {
          created_at: string
          id: string
          item: Database["public"]["Enums"]["item_de_pontuacao"]
          pontos: number
          updated_at: string
          vigente_desde: string
        }
        Insert: {
          created_at?: string
          id?: string
          item: Database["public"]["Enums"]["item_de_pontuacao"]
          pontos: number
          updated_at?: string
          vigente_desde: string
        }
        Update: {
          created_at?: string
          id?: string
          item?: Database["public"]["Enums"]["item_de_pontuacao"]
          pontos?: number
          updated_at?: string
          vigente_desde?: string
        }
        Relationships: []
      }
    }
    Views: {
      despesas_por_caso: {
        Row: {
          bebe_nome: string | null
          caso_id: string | null
          dia: string | null
          lancamentos: number | null
          mae_nome: string | null
          maternidade_sigla: string | null
          pacote_nome: string | null
          status_operacional:
            | Database["public"]["Enums"]["status_operacional"]
            | null
          total: number | null
          total_outro: number | null
          total_refeicao: number | null
          total_uber_ida: number | null
          total_uber_volta: number | null
          ultimo_lancamento_em: string | null
        }
        Relationships: []
      }
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
      operacao_dos_casos: {
        Row: {
          adicionais: string[] | null
          avaliado: boolean | null
          bebe_nome: string | null
          comercial: boolean | null
          dia: string | null
          dia_semana: number | null
          equipamentos: string[] | null
          fotografou_o_parto: string | null
          horas_ate_envio: number | null
          id: string | null
          links: string[] | null
          mae_nome: string | null
          maternidade_id: string | null
          maternidade_nome: string | null
          maternidade_sigla: string | null
          nasceu: boolean | null
          nome_de_busca: string | null
          oferta_fotolivro: string | null
          oferta_new_born: string | null
          oferta_reels: string | null
          pacote_id: string | null
          pacote_nome: string | null
          passou_uti: boolean | null
          prazo: string | null
          previsao_em: string | null
          reaberto: boolean | null
          situacao: string | null
          termo: string | null
          teve_handoff: boolean | null
          total_despesas: number | null
          turno: string | null
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
      quadro_casos: {
        Row: {
          arquivado: boolean | null
          avaliacao_em: string | null
          bebe_nome: string | null
          cor_calendar: string | null
          created_at: string | null
          dia: string | null
          eh_rascunho: boolean | null
          eh_terminal: boolean | null
          encerrado_em: string | null
          etapas_concluidas: number | null
          etapas_total: number | null
          falta_maternidade: boolean | null
          falta_pacote: boolean | null
          id: string | null
          liberado_para_entrega_em: string | null
          liberado_para_entrega_por_nome: string | null
          mae_nome: string | null
          maternidade_id: string | null
          maternidade_nome: string | null
          maternidade_sigla: string | null
          motivo_cancelamento: string | null
          na_secao: boolean | null
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
          previsao_sem_hora: boolean | null
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
          total_despesas: number | null
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
      caso_tem_trabalho: { Args: { p_caso_id: string }; Returns: boolean }
      concluir_etapa: {
        Args: { p_caso_etapa_id: string; p_observacao?: string }
        Returns: undefined
      }
      concluir_etapa_com_entregaveis: {
        Args: {
          p_caso_etapa_id: string
          p_entregaveis: Json
          p_observacao?: string
        }
        Returns: undefined
      }
      configurar_segredo_do_sync: {
        Args: { p_nome: string; p_valor: string }
        Returns: string
      }
      confirmar_entrega: { Args: { p_caso_id: string }; Returns: undefined }
      confirmar_entrega_do_click_home: {
        Args: { p_caso_etapa_id: string }
        Returns: undefined
      }
      confirmar_entrega_do_video: {
        Args: { p_caso_etapa_id: string }
        Returns: undefined
      }
      criar_caso: {
        Args: {
          p_bebe_nome: string
          p_cesarea_em?: string
          p_click_home?: boolean
          p_fotolivro?: boolean
          p_mae_nome: string
          p_maternidade_id: string
          p_observacao?: string
          p_pacote_id: string
          p_previsao_em: string
          p_sem_hora?: boolean
        }
        Returns: string
      }
      definir_foto_da_pessoa: {
        Args: { p_foto_path: string; p_pessoa_id: string }
        Returns: undefined
      }
      definir_minha_foto: { Args: { p_foto_path: string }; Returns: undefined }
      definir_oferta_comercial: {
        Args: {
          p_caso_id: string
          p_fase: Database["public"]["Enums"]["fase_comercial"]
          p_oferta: Database["public"]["Enums"]["oferta_comercial"]
        }
        Returns: boolean
      }
      definir_padrao_de_tempo: {
        Args: {
          p_etapa_tipo: Database["public"]["Enums"]["etapa_tipo"]
          p_minutos: number
        }
        Returns: undefined
      }
      definir_pontos_do_item: {
        Args: {
          p_item: Database["public"]["Enums"]["item_de_pontuacao"]
          p_pontos: number
        }
        Returns: undefined
      }
      devolver_para_o_quadro: {
        Args: { p_caso_id: string; p_motivo: string }
        Returns: undefined
      }
      dia_da_regua_de_pontos: { Args: never; Returns: string }
      disparar_sync_calendar: { Args: never; Returns: string }
      dispensar_etapa: {
        Args: { p_caso_etapa_id: string; p_motivo?: string }
        Returns: undefined
      }
      editar_caso: {
        Args: {
          p_bebe_nome: string
          p_caso_id: string
          p_cesarea_em?: string
          p_click_home?: boolean
          p_fotolivro?: boolean
          p_mae_nome: string
          p_maternidade_id: string
          p_observacao?: string
          p_pacote_id: string
          p_previsao_em: string
          p_sem_hora?: boolean
        }
        Returns: string
      }
      eh_adm: { Args: never; Returns: boolean }
      eh_atendimento: { Args: never; Returns: boolean }
      eh_pessoa_ativa: { Args: never; Returns: boolean }
      enviar_click_home_para_escolha: {
        Args: { p_caso_etapa_id: string; p_link: string }
        Returns: undefined
      }
      enviar_fotolivro_para_aprovacao: {
        Args: { p_capa: string; p_caso_etapa_id: string; p_link: string }
        Returns: undefined
      }
      enviar_video_nos_links_do_caso: {
        Args: { p_caso_etapa_id: string }
        Returns: undefined
      }
      enviar_video_para_entrega: {
        Args: {
          p_caso_etapa_id: string
          p_link_video: string
          p_link_wetransfer: string
        }
        Returns: undefined
      }
      exigir_gestao: { Args: never; Returns: undefined }
      exigir_operacao: { Args: { p_filtros: Json }; Returns: undefined }
      iniciar_etapa: { Args: { p_caso_etapa_id: string }; Returns: undefined }
      inicio_das_metricas: { Args: never; Returns: string }
      item_de_pontuacao: {
        Args: {
          p_pacote_slug: string
          p_rodada: number
          p_tipo: Database["public"]["Enums"]["etapa_tipo"]
        }
        Returns: Database["public"]["Enums"]["item_de_pontuacao"]
      }
      liberar_para_entrega: { Args: { p_caso_id: string }; Returns: undefined }
      limpar_notificacoes_gerais: { Args: never; Returns: string }
      lista_do_filtro: {
        Args: { p_chave: string; p_filtros: Json }
        Returns: string[]
      }
      marcar_fotolivro_enviado: {
        Args: { p_caso_etapa_id: string }
        Returns: undefined
      }
      marcar_notificacoes_vistas: { Args: never; Returns: string }
      metricas_da_equipe_por_etapa: {
        Args: { p_fim: string; p_inicio: string }
        Returns: {
          concluidas: number
          mediana_min: number
          medidas: number
          p25_min: number
          p75_min: number
          pessoas: number
          tipo: Database["public"]["Enums"]["etapa_tipo"]
        }[]
      }
      metricas_dentro_do_padrao: {
        Args: { p_fim: string; p_inicio: string }
        Returns: {
          com_padrao: number
          dentro: number
          medidas: number
          pessoa_id: string
          tipo: Database["public"]["Enums"]["etapa_tipo"]
        }[]
      }
      metricas_fases_de_campo: {
        Args: { p_fim: string; p_inicio: string }
        Returns: {
          etapa_tipo: Database["public"]["Enums"]["etapa_tipo"]
          etapas: number
          fase: Database["public"]["Enums"]["fase_de_campo"]
          media_min: number
          pessoa_id: string
          soma_min: number
        }[]
      }
      metricas_plantoes_por_pessoa: {
        Args: { p_fim: string; p_inicio: string }
        Returns: {
          minutos: number
          pessoa_id: string
          plantoes: number
        }[]
      }
      metricas_pontos_por_pessoa: {
        Args: { p_fim: string; p_inicio: string }
        Returns: {
          divididas: number
          etapas: number
          item: Database["public"]["Enums"]["item_de_pontuacao"]
          pessoa_id: string
          pontos: number
        }[]
      }
      metricas_por_etapa: {
        Args: { p_fim: string; p_inicio: string }
        Returns: {
          com_prazo: number
          concluidas: number
          concluidas_por_outra: number
          em_paralelo: number
          mediana_min: number
          medidas: number
          no_prazo: number
          pessoa_id: string
          soma_min: number
          tipo: Database["public"]["Enums"]["etapa_tipo"]
        }[]
      }
      metricas_por_pessoa: {
        Args: { p_fim: string; p_inicio: string }
        Returns: {
          ativo: boolean
          atribuicoes_feitas: number
          avaliacoes_feitas: number
          dias_com_trabalho: number
          entregas_confirmadas: number
          material_baixou: number
          material_subiu: number
          nome: string
          papel_sistema: string
          passagens_dadas: number
          passagens_recebidas: number
          pessoa_id: string
          termos_registrados: number
          voltou_para_ajuste: number
        }[]
      }
      metricas_prazo_do_periodo: {
        Args: { p_fim: string; p_inicio: string }
        Returns: {
          enviados: number
          mediana_horas_ate_confirmacao: number
          mediana_horas_ate_envio: number
          no_prazo: number
        }[]
      }
      metricas_serie_da_equipe: {
        Args: {
          p_fim: string
          p_grao: string
          p_inicio: string
          p_pessoa_id?: string
        }
        Returns: {
          enviados: number
          fim: string
          inicio: string
          mediana_horas_ate_confirmacao: number
          mediana_horas_ate_envio: number
          no_prazo: number
          por_tipo: Json
          voltou_para_ajuste: number
        }[]
      }
      mover_album: {
        Args: {
          p_caso_etapa_id: string
          p_fase: Database["public"]["Enums"]["fase_album"]
        }
        Returns: undefined
      }
      mover_click_home: {
        Args: {
          p_caso_etapa_id: string
          p_fase: Database["public"]["Enums"]["fase_click_home"]
        }
        Returns: undefined
      }
      mover_fase_de_campo: {
        Args: {
          p_caso_etapa_id: string
          p_fase: Database["public"]["Enums"]["fase_de_campo"]
        }
        Returns: undefined
      }
      mover_para_uti: { Args: { p_caso_id: string }; Returns: undefined }
      mover_video_master: {
        Args: {
          p_caso_etapa_id: string
          p_fase: Database["public"]["Enums"]["status_etapa"]
        }
        Returns: undefined
      }
      operacao_buscar: {
        Args: {
          p_deslocamento?: number
          p_filtros: Json
          p_limite?: number
          p_ordem?: string
        }
        Returns: {
          adicionais: string[]
          avaliado: boolean
          bebe_nome: string
          dia: string
          dia_semana: number
          equipamentos: string[]
          fotografou_o_parto: string
          horas_ate_envio: number
          id: string
          links: Json
          mae_nome: string
          maternidade_sigla: string
          ofertas: Json
          pacote_nome: string
          passou_uti: boolean
          prazo: string
          reaberto: boolean
          situacao: string
          termo: string
          teve_handoff: boolean
          total: number
          total_despesas: number
          trabalho: Json
          turno: string
        }[]
      }
      operacao_facetas: {
        Args: { p_filtros: Json }
        Returns: {
          contagem: number
          grupo: string
          rotulo: string
          valor: string
        }[]
      }
      operacao_grafico: {
        Args: { p_eixo: string; p_filtros: Json }
        Returns: {
          cancelados: number
          casos: number
          chave: string
          enviados: number
          mediana_horas_ate_envio: number
          no_prazo: number
          partos: number
          rotulo: string
          total_despesas: number
        }[]
      }
      operacao_marcas: {
        Args: { p_filtros: Json }
        Returns: {
          falhas: number
          id: string
          m_adicionais: boolean
          m_avaliado: boolean
          m_com_despesa: boolean
          m_dias_semana: boolean
          m_equipamentos: boolean
          m_handoff: boolean
          m_links: boolean
          m_maternidades: boolean
          m_oferta_fotolivro: boolean
          m_oferta_new_born: boolean
          m_oferta_reels: boolean
          m_pacotes: boolean
          m_prazos: boolean
          m_reaberto: boolean
          m_situacoes: boolean
          m_termos: boolean
          m_trabalho: boolean
          m_trabalho_sem_etapas: boolean
          m_trabalho_sem_pessoas: boolean
          m_turnos: boolean
          m_uti: boolean
        }[]
      }
      operacao_resumo: {
        Args: { p_filtros: Json }
        Returns: {
          cancelados: number
          casos: number
          enviados: number
          mediana_horas_ate_envio: number
          no_prazo: number
          partos: number
          total_despesas: number
        }[]
      }
      ordem_padrao_da_etapa: {
        Args: { p_tipo: Database["public"]["Enums"]["etapa_tipo"] }
        Returns: number
      }
      padroes_de_tempo: {
        Args: never
        Returns: {
          etapa_tipo: Database["public"]["Enums"]["etapa_tipo"]
          minutos_esperados: number
          vigente_desde: string
        }[]
      }
      pausar_etapa: { Args: { p_caso_etapa_id: string }; Returns: undefined }
      pedir_alteracao_da_etapa: {
        Args: { p_caso_etapa_id: string; p_motivo: string }
        Returns: undefined
      }
      periodo_das_metricas: {
        Args: { p_fim: string; p_inicio: string }
        Returns: Record<string, unknown>
      }
      planejar_rendicao: {
        Args: { p_caso_etapa_id: string; p_proxima_pessoa_id: string }
        Returns: undefined
      }
      pontos_por_item_vigentes: {
        Args: never
        Returns: {
          item: Database["public"]["Enums"]["item_de_pontuacao"]
          pontos: number
          vigente_desde: string
        }[]
      }
      previsao_do_dia: {
        Args: { p_previsao: string; p_sem_hora: boolean }
        Returns: string
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
      registrar_avaliacao: { Args: { p_caso_id: string }; Returns: undefined }
      registrar_despesa: {
        Args: {
          p_caso_id: string
          p_descricao?: string
          p_momento?: Database["public"]["Enums"]["momento_despesa"]
          p_pessoa_id?: string
          p_tipo: Database["public"]["Enums"]["tipo_despesa"]
          p_valor: number
        }
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
      registrar_material_da_etapa: {
        Args: {
          p_campo: Database["public"]["Enums"]["campo_material"]
          p_caso_etapa_id: string
          p_valor: string
        }
        Returns: undefined
      }
      registrar_termo: {
        Args: {
          p_caso_id: string
          p_termo: Database["public"]["Enums"]["termo_status"]
        }
        Returns: undefined
      }
      remover_despesa: {
        Args: { p_despesa_id: string; p_motivo?: string }
        Returns: undefined
      }
      remover_entregavel: {
        Args: { p_entregavel_id: string; p_motivo?: string }
        Returns: undefined
      }
      restaurar_caso_cancelado_pelo_sync: {
        Args: { p_caso_id: string; p_motivo: string }
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
      sync_casos_para_atualizar_no_google: {
        Args: never
        Returns: {
          bebe_nome: string
          cancelado: boolean
          caso_id: string
          cesarea_em: string
          click_home: boolean
          cor_calendar: string
          descricao_do_sistema: boolean
          google_event_id: string
          mae_nome: string
          maternidade_sigla: string
          observacao_calendar: string
          pacote_nome: string
          previsao_em: string
          previsao_sem_hora: boolean
          versao: number
        }[]
      }
      sync_casos_para_o_google: {
        Args: never
        Returns: {
          bebe_nome: string
          caso_id: string
          cesarea_em: string
          click_home: boolean
          cor_calendar: string
          mae_nome: string
          maternidade_sigla: string
          observacao_calendar: string
          pacote_nome: string
          previsao_em: string
          previsao_sem_hora: boolean
        }[]
      }
      sync_definir_previsao_sem_hora: {
        Args: { p_google_event_id: string; p_sem_hora: boolean }
        Returns: string
      }
      sync_marcar_click_home: {
        Args: { p_google_event_id: string }
        Returns: string
      }
      sync_marcar_google_atualizado: {
        Args: { p_caso_id: string; p_resultado?: string; p_versao: number }
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
      sync_vincular_evento_google: {
        Args: { p_caso_id: string; p_google_event_id: string }
        Returns: string
      }
      telas_efetivas: {
        Args: {
          p_papel: Database["public"]["Enums"]["papel_sistema"]
          p_telas: Database["public"]["Enums"]["tela"][]
        }
        Returns: Database["public"]["Enums"]["tela"][]
      }
      telas_padrao_do_papel: {
        Args: { p_papel: Database["public"]["Enums"]["papel_sistema"] }
        Returns: Database["public"]["Enums"]["tela"][]
      }
      tem_tela: {
        Args: { p_tela: Database["public"]["Enums"]["tela"] }
        Returns: boolean
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
      campo_material: "cartao_foto" | "cartao_video" | "baixou" | "upload"
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
        | "click_home"
        | "acompanhamento"
      fase_album:
        | "aguardando_pagamento"
        | "aguardando_diagramacao"
        | "diagramando"
        | "enviar_para_aprovacao"
        | "aguardando_aprovacao"
        | "pedido_de_alteracoes"
        | "aprovado"
        | "enviado_grafica"
        | "pronto_para_entrega"
        | "entregue"
      fase_click_home:
        | "aguardando_edicao"
        | "editando"
        | "criar_galeria"
        | "enviar_para_escolha"
        | "finalizado"
      fase_comercial: "apresentar" | "enviado" | "recusou" | "vendido"
      fase_de_campo:
        | "deslocamento_recebimento"
        | "aguardando_internamento"
        | "admissao_cco"
        | "nascimento"
        | "cuidados"
      item_de_pontuacao:
        | "nascimento"
        | "nascimento_birth"
        | "entrada"
        | "banho"
        | "fechamento"
        | "encontro_irmaos"
        | "saida_uti"
        | "alta"
        | "foto_parto"
        | "foto_bf"
        | "foto_revisao"
        | "reels_parto"
        | "reels_bf"
        | "reels_revisao"
        | "video_master"
        | "fotolivro"
        | "new_born"
        | "acompanhamento"
      momento_despesa: "parto" | "substituicao" | "fechamento"
      oferta_comercial: "reels" | "new_born" | "fotolivro"
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
      tela:
        | "quadro"
        | "concluidos"
        | "calendario"
        | "equipe"
        | "despesas"
        | "relatorios"
        | "comercial"
      termo_status:
        | "assinado"
        | "pendente"
        | "sem_contrato"
        | "nao_aplicavel"
        | "nao_autorizado"
      tipo_despesa: "uber_ida" | "uber_volta" | "refeicao" | "outro"
      tipo_entregavel:
        | "google_photos"
        | "wetransfer"
        | "cadeado"
        | "reels"
        | "album"
        | "video"
        | "video_wetransfer"
        | "click_home"
        | "google_drive"
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
      campo_material: ["cartao_foto", "cartao_video", "baixou", "upload"],
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
        "click_home",
        "acompanhamento",
      ],
      fase_album: [
        "aguardando_pagamento",
        "aguardando_diagramacao",
        "diagramando",
        "enviar_para_aprovacao",
        "aguardando_aprovacao",
        "pedido_de_alteracoes",
        "aprovado",
        "enviado_grafica",
        "pronto_para_entrega",
        "entregue",
      ],
      fase_click_home: [
        "aguardando_edicao",
        "editando",
        "criar_galeria",
        "enviar_para_escolha",
        "finalizado",
      ],
      fase_comercial: ["apresentar", "enviado", "recusou", "vendido"],
      fase_de_campo: [
        "deslocamento_recebimento",
        "aguardando_internamento",
        "admissao_cco",
        "nascimento",
        "cuidados",
      ],
      item_de_pontuacao: [
        "nascimento",
        "nascimento_birth",
        "entrada",
        "banho",
        "fechamento",
        "encontro_irmaos",
        "saida_uti",
        "alta",
        "foto_parto",
        "foto_bf",
        "foto_revisao",
        "reels_parto",
        "reels_bf",
        "reels_revisao",
        "video_master",
        "fotolivro",
        "new_born",
        "acompanhamento",
      ],
      momento_despesa: ["parto", "substituicao", "fechamento"],
      oferta_comercial: ["reels", "new_born", "fotolivro"],
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
      tela: [
        "quadro",
        "concluidos",
        "calendario",
        "equipe",
        "despesas",
        "relatorios",
        "comercial",
      ],
      termo_status: [
        "assinado",
        "pendente",
        "sem_contrato",
        "nao_aplicavel",
        "nao_autorizado",
      ],
      tipo_despesa: ["uber_ida", "uber_volta", "refeicao", "outro"],
      tipo_entregavel: [
        "google_photos",
        "wetransfer",
        "cadeado",
        "reels",
        "album",
        "video",
        "video_wetransfer",
        "click_home",
        "google_drive",
      ],
      turno: ["diurno", "noturno", "comercial"],
    },
  },
} as const

