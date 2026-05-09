import { store } from './src/lib/store';

const projects = store.getAllProjects();
console.log(JSON.stringify(projects, null, 2));
