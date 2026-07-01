import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const TermsOfUsePage = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-10"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </Link>

        <h1 className="text-3xl font-light tracking-wide mb-2">Termos de Uso</h1>
        <p className="text-sm text-muted-foreground mb-12">
          Última atualização: {new Date().toLocaleDateString('pt-BR')}
        </p>

        <div className="space-y-10 text-sm leading-relaxed text-muted-foreground">
          <section>
            <h2 className="text-lg font-medium text-foreground mb-3">1. Aceitação dos Termos</h2>
            <p>
              Ao acessar e utilizar a plataforma YLEON, você declara que leu, compreendeu e concorda
              com estes Termos de Uso. Caso não concorde com qualquer disposição, solicitamos que
              interrompa o uso da plataforma imediatamente.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-foreground mb-3">2. Descrição do Serviço</h2>
            <p>
              A YLEON é uma plataforma digital de curadoria de produtos para profissionais de
              arquitetura e design de interiores. Oferecemos catálogo de produtos, ferramentas de
              comparação, gestão de projetos e compartilhamento com clientes.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-foreground mb-3">3. Cadastro e Acesso</h2>
            <p>
              O acesso à plataforma é restrito a profissionais aprovados. Ao se cadastrar, você
              declara que as informações fornecidas são verdadeiras e se compromete a mantê-las
              atualizadas. Cada conta é pessoal e intransferível — o compartilhamento de credenciais
              é proibido.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-foreground mb-3">4. Uso Permitido</h2>
            <p className="mb-2">É permitido utilizar a plataforma exclusivamente para:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Consultar e pesquisar produtos do catálogo</li>
              <li>Criar e gerenciar projetos com produtos selecionados</li>
              <li>Compartilhar projetos com clientes através dos links gerados</li>
              <li>Comparar especificações técnicas de produtos</li>
              <li>Salvar produtos como favoritos para referência futura</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-medium text-foreground mb-3">5. Uso Proibido</h2>
            <p className="mb-2">É expressamente proibido:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Copiar, reproduzir ou distribuir imagens e conteúdos da plataforma sem autorização</li>
              <li>Utilizar a plataforma para fins comerciais não autorizados</li>
              <li>Tentar acessar áreas restritas ou dados de outros usuários</li>
              <li>Utilizar ferramentas automatizadas para extração de dados (scraping)</li>
              <li>Compartilhar credenciais de acesso com terceiros</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-medium text-foreground mb-3">6. Propriedade Intelectual</h2>
            <p>
              Todo o conteúdo disponibilizado na plataforma — incluindo imagens, textos, logotipos,
              fichas técnicas e arquivos — é de propriedade das respectivas marcas parceiras ou da
              YLEON. O uso destes conteúdos está restrito ao contexto profissional de especificação
              e apresentação de projetos.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-foreground mb-3">7. Projetos Compartilhados</h2>
            <p>
              Os links de compartilhamento de projetos são de responsabilidade do usuário que os
              gerou. A YLEON não se responsabiliza pelo uso indevido de links compartilhados.
              Recomendamos cautela ao compartilhar projetos que contenham informações sensíveis de
              clientes.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-foreground mb-3">8. Disponibilidade</h2>
            <p>
              A YLEON se esforça para manter a plataforma disponível ininterruptamente, mas não
              garante a ausência de falhas, interrupções para manutenção ou indisponibilidades
              temporárias. As informações de produtos, incluindo disponibilidade e especificações,
              podem ser alteradas pelas marcas sem aviso prévio.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-foreground mb-3">9. Limitação de Responsabilidade</h2>
            <p>
              A YLEON atua como plataforma de curadoria e não realiza vendas diretas. Não nos
              responsabilizamos por negociações, transações ou acordos comerciais realizados entre
              usuários e marcas parceiras. As informações dos produtos são fornecidas pelas marcas
              e apresentadas como referência.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-foreground mb-3">10. Alterações nos Termos</h2>
            <p>
              Reservamo-nos o direito de modificar estes termos a qualquer momento. Alterações
              significativas serão comunicadas através da plataforma. O uso continuado após
              modificações implica aceitação dos novos termos.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-foreground mb-3">11. Contato</h2>
            <p>
              Dúvidas ou solicitações relacionadas a estes Termos de Uso podem ser enviadas
              através dos canais de atendimento disponíveis na plataforma.
            </p>
          </section>
        </div>

        <div className="mt-16 pt-8 border-t border-border">
          <p className="text-xs text-muted-foreground/60 text-center">
            © {new Date().getFullYear()} YLEON. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </div>
  );
};

export default TermsOfUsePage;
