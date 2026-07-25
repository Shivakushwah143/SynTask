import os
from pymongo import MongoClient


def load_env(path):
    env = {}
    try:
        with open(path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                if '=' in line:
                    k, v = line.split('=', 1)
                    env[k.strip()] = v.strip()
    except FileNotFoundError:
        pass
    return env


def main():
    repo_root = os.path.dirname(os.path.dirname(__file__))
    env_path = os.path.join(repo_root, '.env')
    env = load_env(env_path)

    mongodb_url = env.get('MONGODB_URL') or os.environ.get('MONGODB_URL')
    db_name = env.get('DATABASE_NAME') or os.environ.get('DATABASE_NAME')

    if not mongodb_url:
        print('MONGODB_URL not found in .env or environment')
        return
    if not db_name:
        print('DATABASE_NAME not found in .env or environment')
        return

    client = MongoClient(mongodb_url)
    db = client[db_name]

    col = db.get_collection('google_workspace_connections')
    docs = list(col.find({}).sort('created_at', -1).limit(20))
    if not docs:
        print('No google_workspace_connections documents found')
        return

    for d in docs:
        d.pop('_id', None)
        # redact tokens
        d.pop('access_token_encrypted', None)
        d.pop('refresh_token_encrypted', None)
        print(d)


if __name__ == '__main__':
    main()
