import json, math, sys


def run(p, steps, dt):
    N = max(1.0, float(p.get('population', 1000)))
    beta = max(0.0, float(p.get('contactRate', 0.55)))
    gamma = max(0.0, float(p.get('recoveryRate', 0.12)))
    I0 = min(N, max(0.0, float(p.get('initialInfected', 10))))
    S, I, R = N - I0, I0, 0.0
    for k in range(steps):
        t = k * dt
        yield {
            'type':'state', 't':t,
            'state':{'susceptible':S,'infected':I,'recovered':R},
            'derived':{
                'infectedFraction': I/N,
                'reproductionNumber': beta/gamma if gamma else math.inf,
                'peakRisk': beta * I/N,
            }
        }
        dS = -beta * S * I / N
        dI = beta * S * I / N - gamma * I
        dR = gamma * I
        S = max(0.0, S + dS * dt)
        I = max(0.0, I + dI * dt)
        R = min(N, max(0.0, R + dR * dt))


def main():
    request = json.loads(sys.stdin.readline())
    p = request.get('parameters', {})
    steps = int(request.get('steps', 240))
    dt = float(request.get('dt', 0.25))
    manifest = {
        'type':'manifest','id':'sir-epidemic','name':'SIR epidemic',
        'description':'A deterministic compartment model for susceptible, infected, and recovered populations.',
        'parameters':[
            {'id':'population','label':'Population','type':'number','min':100,'max':1000000,'step':100,'default':1000,'unit':'people'},
            {'id':'contactRate','label':'Contact rate','type':'number','min':0.0,'max':2.0,'step':0.01,'default':0.55,'unit':'1/day'},
            {'id':'recoveryRate','label':'Recovery rate','type':'number','min':0.01,'max':1.0,'step':0.01,'default':0.12,'unit':'1/day'},
            {'id':'initialInfected','label':'Initial infected','type':'number','min':1,'max':500,'step':1,'default':10,'unit':'people'},
        ],
        'state':['susceptible','infected','recovered'],
        'derived':['infectedFraction','reproductionNumber','peakRisk'],
        'runtime':{'mode':'deterministic','version':2}
    }
    print(json.dumps(manifest, separators=(',',':')))
    for frame in run(p, steps, dt):
        print(json.dumps(frame, separators=(',',':')))

if __name__ == '__main__': main()
