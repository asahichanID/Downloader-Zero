import progressHandler from '../progress.ts';

export default async function handler(req: any, res: any) {
  return progressHandler(req, res);
}
