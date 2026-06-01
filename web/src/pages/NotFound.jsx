import { Link } from 'react-router-dom';
import { Empty } from '../components/Common.jsx';
import { useI18n } from '../lib/i18n.jsx';

export function NotFound() {
  const { t } = useI18n();
  return (
    <div className="page"><div className="container">
      <Empty icon="compass" title={t('Страница не найдена')} sub="404"
        action={<Link className="btn btn-primary mt-16" to="/">{t('На главную')}</Link>} />
    </div></div>
  );
}
