import '@maersk-global/fonts/maeu/fonts.css';
import '@maersk-global/mds-foundations/css/foundations.css';
import '@maersk-global/mds-design-tokens/maersk/light/css/design-tokens-px.css';
import '@maersk-global/mds-components-core';

import { MdsConfig } from '@maersk-global/mds-config';
MdsConfig.iconsDynamicImportPath = import.meta.env.MODE === 'development' ? '/node_modules/' : '/assets/node_modules/';


// Export for Vite to bundle properly
export default {}; 