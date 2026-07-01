import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import logoYleon from "@/assets/logo-yleon.png";

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border/60 py-6 px-8">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group">
            <ArrowLeft size={16} className="text-muted-foreground group-hover:text-foreground transition-colors" />
            <img src={logoYleon} alt="YLEON" className="h-16" />
          </Link>
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Política de Privacidade
          </span>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-8 py-16">
        <h1 className="text-3xl font-light tracking-tight mb-2">Política de Privacidade</h1>
        <p className="text-sm text-muted-foreground mb-12">Última atualização: Abril de 2026</p>

        <div className="space-y-10 text-sm leading-relaxed text-muted-foreground">
          {/* 1 */}
          <section>
            <h2 className="text-base font-medium text-foreground mb-3">1. Introdução</h2>
            <p>
              A plataforma <strong className="text-foreground">YLEON</strong> é um catálogo digital exclusivo para arquitetos e profissionais de design de interiores. 
              Esta Política de Privacidade descreve como coletamos, usamos, armazenamos e protegemos seus dados pessoais ao utilizar nossa plataforma.
            </p>
          </section>

          {/* 2 */}
          <section>
            <h2 className="text-base font-medium text-foreground mb-3">2. Dados Coletados</h2>
            <p className="mb-3">Coletamos os seguintes dados quando você utiliza a plataforma:</p>
            <ul className="list-disc pl-6 space-y-1.5">
              <li><strong className="text-foreground">Dados de cadastro:</strong> nome completo e endereço de e-mail.</li>
              <li><strong className="text-foreground">Dados de uso:</strong> produtos visualizados, favoritos salvos, projetos criados e itens adicionados a projetos.</li>
              <li><strong className="text-foreground">Dados de navegação:</strong> cookies funcionais necessários para o funcionamento da plataforma.</li>
              <li><strong className="text-foreground">Dados de comparação:</strong> produtos selecionados para comparação lado a lado.</li>
            </ul>
          </section>

          {/* 3 */}
          <section>
            <h2 className="text-base font-medium text-foreground mb-3">3. Finalidade do Uso dos Dados</h2>
            <p className="mb-3">Seus dados são utilizados para:</p>
            <ul className="list-disc pl-6 space-y-1.5">
              <li>Autenticar e gerenciar sua conta na plataforma.</li>
              <li>Personalizar sua experiência com favoritos e projetos salvos.</li>
              <li>Permitir o compartilhamento de projetos com clientes via link seguro.</li>
              <li>Gerar insights de curadoria para os vendedores parceiros (dados agregados e anonimizados).</li>
              <li>Melhorar a qualidade e o desempenho da plataforma.</li>
            </ul>
          </section>

          {/* 4 */}
          <section>
            <h2 className="text-base font-medium text-foreground mb-3">4. Compartilhamento de Dados</h2>
            <p>
              Seus dados pessoais <strong className="text-foreground">não são vendidos</strong> a terceiros. 
              O compartilhamento ocorre apenas nas seguintes situações:
            </p>
            <ul className="list-disc pl-6 space-y-1.5 mt-3">
              <li><strong className="text-foreground">Projetos compartilhados:</strong> quando você gera um link de compartilhamento, os dados do projeto (produtos, acabamentos, imagens) ficam acessíveis via token seguro.</li>
              <li><strong className="text-foreground">Dados agregados:</strong> informações estatísticas e anonimizadas podem ser utilizadas para análises de curadoria pelos vendedores parceiros.</li>
              <li><strong className="text-foreground">Obrigações legais:</strong> quando exigido por lei ou ordem judicial.</li>
            </ul>
          </section>

          {/* 5 */}
          <section>
            <h2 className="text-base font-medium text-foreground mb-3">5. Armazenamento e Segurança</h2>
            <p>
              Seus dados são armazenados em servidores seguros com criptografia em trânsito (TLS/SSL) e em repouso. 
              Utilizamos autenticação segura com verificação de e-mail e proteção contra senhas comprometidas (HIBP). 
              As políticas de acesso ao banco de dados seguem o princípio de menor privilégio (Row Level Security).
            </p>
          </section>

          {/* 6 */}
          <section>
            <h2 className="text-base font-medium text-foreground mb-3">6. Cookies</h2>
            <p>
              Utilizamos apenas cookies estritamente necessários para o funcionamento da plataforma, como manutenção de sessão de login 
              e preferências de consentimento. Não utilizamos cookies de rastreamento publicitário.
            </p>
          </section>

          {/* 7 */}
          <section>
            <h2 className="text-base font-medium text-foreground mb-3">7. Seus Direitos (LGPD)</h2>
            <p className="mb-3">De acordo com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018), você tem direito a:</p>
            <ul className="list-disc pl-6 space-y-1.5">
              <li>Acessar seus dados pessoais armazenados.</li>
              <li>Solicitar a correção de dados incompletos ou inexatos.</li>
              <li>Solicitar a exclusão de seus dados pessoais.</li>
              <li>Revogar o consentimento para o tratamento de dados.</li>
              <li>Solicitar a portabilidade de seus dados.</li>
            </ul>
            <p className="mt-3">
              Para exercer qualquer um desses direitos, entre em contato conosco pelo e-mail informado abaixo.
            </p>
          </section>

          {/* 8 */}
          <section>
            <h2 className="text-base font-medium text-foreground mb-3">8. Retenção de Dados</h2>
            <p>
              Seus dados são mantidos enquanto sua conta estiver ativa na plataforma. 
              Caso solicite a exclusão da conta, todos os dados pessoais serão removidos em até 30 dias, 
              exceto quando houver obrigação legal de retenção.
            </p>
          </section>

          {/* 9 */}
          <section>
            <h2 className="text-base font-medium text-foreground mb-3">9. Alterações nesta Política</h2>
            <p>
              Esta política pode ser atualizada periodicamente. Notificaremos sobre mudanças significativas 
              por meio da própria plataforma. A data da última atualização estará sempre indicada no topo desta página.
            </p>
          </section>

          {/* 10 */}
          <section>
            <h2 className="text-base font-medium text-foreground mb-3">10. Contato</h2>
            <p>
              Para dúvidas, solicitações ou reclamações sobre esta Política de Privacidade, 
              entre em contato pelo e-mail: <strong className="text-foreground">privacidade@yleon.com.br</strong>
            </p>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-12 border-t border-border/50 bg-background">
        <div className="max-w-4xl mx-auto px-8 text-center">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50">
            © {new Date().getFullYear()} YLEON — Todos os direitos reservados
          </p>
        </div>
      </footer>
    </div>
  );
}
