import { handleEstudiar } from './estudiar.js';

export default {
  async fetch(request, env) {
    return handleEstudiar(request, env);
  }
};
