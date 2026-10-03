"""Run native decision fixtures and shut down the server before exiting."""
import argparse
import json
from pathlib import Path
import subprocess
import time
import urllib.request


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--binary', default='llama.cpp/build/bin/llama-server')
    parser.add_argument('--model', default='models/strands-f16.gguf')
    parser.add_argument('--gpu-layers', default='0')
    parser.add_argument('--report', default='reports/native-parity.json')
    parser.add_argument('--port', type=int, default=8097)
    parser.add_argument('--tolerance', type=float, default=0.01)
    args = parser.parse_args()
    url = f'http://127.0.0.1:{args.port}'
    command = [args.binary, '-m', args.model, '-ngl', args.gpu_layers, '-c', '4096',
               '-b', '512', '-ub', '512', '-t', '2', '-np', '1', '-lv', '4', '--port', str(args.port)]
    server = subprocess.Popen(command)
    try:
        for _ in range(240):
            if server.poll() is not None:
                raise RuntimeError(f'server exited: {server.returncode}')
            try:
                with urllib.request.urlopen(url+'/health', timeout=1) as response:
                    if response.status == 200:
                        break
            except OSError:
                time.sleep(0.5)
        else:
            raise RuntimeError('server did not become ready')
        rows = []
        for fixture in json.loads(Path('fixtures/reference.json').read_text()):
            request = urllib.request.Request(url+'/v1/systemone', data=json.dumps(fixture['request'], ensure_ascii=False).encode(),
                                             headers={'Content-Type': 'application/json'})
            start = time.monotonic()
            with urllib.request.urlopen(request, timeout=180) as response:
                result = json.load(response)
            errors = []
            flips = []
            confidence_errors = []
            for key, expected in fixture['response']['answers'].items():
                actual = result['answers'][key]
                if expected['type'] == 'noul':
                    errors.append(abs(actual['noul']-expected['noul']))
                else:
                    confidence_errors.append(abs(actual['confidence']-expected['confidence']))
                    errors.extend(abs(actual['probabilities'][k]-p) for k,p in expected['probabilities'].items())
                    if expected['type'] == 'choice':
                        flips.append(actual['choice'] != expected['choice'])
            rows.append({'request': fixture['request'], 'expected': fixture['response'], 'actual': result,
                         'seconds': time.monotonic()-start, 'max_probability_error': max(errors),
                         'max_confidence_error': max(confidence_errors, default=0),
                         'input_tokens_match': result['usage']['input_tokens'] == fixture['response']['usage']['input_tokens'],
                         'top_answer_flips': sum(flips)})
            Path(args.report).write_text(json.dumps(rows, ensure_ascii=False, indent=2)+'\n')
            print(json.dumps(rows[-1]), flush=True)
        if any(row['max_probability_error'] > args.tolerance or not row['input_tokens_match'] for row in rows):
            raise RuntimeError('Parity gate failed; see report')
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()
            server.wait()


if __name__ == '__main__':
    main()
