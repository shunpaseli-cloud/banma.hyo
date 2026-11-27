"""Card-only horse score experiment: features (strict prior dates), monthly walk-forward PL per age band."""
import json, math, itertools, collections, datetime as dt
import numpy as np
from scipy.optimize import minimize

F1=['w_rel','w_delta_prev','w_minus_best_top3','best_top3_missing','female','age_months','form_last1','form_avg3',
    'win_rate5','top3_rate5','log_starts','log_days_since','no_history','last_dnf','class_change','class_unknown_or_switch','scratch_hist']
F2=F1+['jockey_top3_365']
LAMBDA=1.0; EVAL_START='2023-01-01'

def band(age): return 'Y' if age is not None and age<=3 else 'O'
def d2(s): return dt.date.fromisoformat(s)

def build_features(races, perturb_from=None, seed=0):
    """Returns list of race dicts with per-starter feature rows. If perturb_from is set, finishes/statuses of races
    dated >= perturb_from are randomized BEFORE they could enter history (leakage audit)."""
    rng=np.random.default_rng(seed)
    if perturb_from:
        races=json.loads(json.dumps(races))
        for r in races:
            if r['date']>=perturb_from:
                st=[h for h in r['horses'] if h['starter']]
                perm=rng.permutation(len(st))+1
                for h,f in zip(st,perm): h['finish']=int(f); h['status']='finished'
                for h in r['horses']:
                    if not h['starter'] and rng.random()<0.5: h['status']='withdrawn'
                r['trifecta']=[[h['no'] for h in sorted(st,key=lambda x:x['finish'])[:3]]]
    hist=collections.defaultdict(list); scr=collections.defaultdict(list); jk=collections.defaultdict(list)
    out=[]
    bydate=collections.defaultdict(list)
    for r in races: bydate[r['date']].append(r)
    for date in sorted(bydate):
        D=d2(date); todays=[]
        for r in bydate[date]:
            st=[h for h in r['horses'] if h['starter'] and h.get('w') is not None and h.get('age') is not None]
            if len(st)<3: continue
            bands={band(h['age']) for h in st}
            rtype=('pure_'+bands.pop()) if len(bands)==1 else 'mixed'
            n=len(st); rows=[]
            for h in st:
                b=band(h['age']); same=[x['w'] for x in st if band(x['age'])==b]
                H=hist[h['key']]; last=H[-1] if H else None
                f={}
                f['w_rel']=h['w']-np.mean(same)
                f['w_delta_prev']=(h['w']-last['w']) if last else 0.0
                t3w=[x['w'] for x in H if x['top3']]
                f['w_minus_best_top3']=(h['w']-max(t3w)) if t3w else 0.0
                f['best_top3_missing']=0.0 if t3w else 1.0
                f['female']=1.0 if h['sex']=='牝' else 0.0
                try:
                    bd=dt.date(int(h['birth'][:4]),int(h['birth'][4:6]),int(h['birth'][6:8])); f['age_months']=(D-bd).days/30.44
                except Exception: f['age_months']=h['age']*12.0
                f['form_last1']=last['nf'] if last else 0.5
                l3=[x['nf'] for x in H[-3:]]; f['form_avg3']=float(np.mean(l3)) if l3 else 0.5
                l5=H[-5:]; k=len(l5)
                f['win_rate5']=(sum(x['win'] for x in l5)+0.12*2)/(k+2)
                f['top3_rate5']=(sum(x['top3'] for x in l5)+0.35*2)/(k+2)
                f['log_starts']=math.log1p(len(H))
                f['log_days_since']=math.log1p(min((D-d2(last['date'])).days,365)) if last else math.log1p(365)
                f['no_history']=0.0 if H else 1.0
                f['last_dnf']=1.0 if (last and last['dnf']) else 0.0
                if last and r['ctype'] and last['ctype']==r['ctype']:
                    f['class_change']=r['cval']-last['cval']; f['class_unknown_or_switch']=0.0
                else: f['class_change']=0.0; f['class_unknown_or_switch']=1.0
                f['scratch_hist']=math.log1p(sum(1 for s in scr[h['key']] if (D-d2(s)).days<=180))
                J=[x for x in jk[h['jockey']] if (D-d2(x[0])).days<=365]
                f['jockey_top3_365']=(sum(x[1] for x in J)+0.30*10)/(len(J)+10)
                rows.append(dict(no=h['no'],band=b,finish=h['finish'],status=h['status'],pop=h.get('popularity'),f=f))
            out.append(dict(rid=r['rid'],date=date,rtype=rtype,n=n,rows=rows,trifecta=r['trifecta'],tri_yen=r['tri_yen'],pdf_verified=r.get('pdf_verified'),src=r['src'],ctype=r['ctype']))
            todays.append((r,st))
        # update history only after the whole date (no same-day leakage)
        for r,st in todays:
            n=len(st)
            for h in st:
                dnf=h['status'] in ('did_not_finish','disqualified') or h['finish'] is None
                nf=1.0 if dnf else (h['finish']-1)/(n-1)
                fin=None if dnf else h['finish']
                hist[h['key']].append(dict(date=date,nf=nf,win=int(fin==1),top3=int(fin is not None and fin<=3),w=h['w'],ctype=r['ctype'],cval=r['cval'],dnf=dnf))
                jk[h['jockey']].append((date,int(fin is not None and fin<=3)))
        for r in bydate[date]:
            for h in r['horses']:
                if not h['starter'] and h['status'] in ('withdrawn','excluded'): scr[h['key']].append(date)
    return out

def order_of(rows):
    fin=[(r['finish'],i) for i,r in enumerate(rows) if r['status'] in('finished',) and r['finish'] is not None]
    fin.sort(); return [i for _,i in fin]

def pack(rlist, feats, band_filter=None):
    X=[];M=[];O=[]
    for r in rlist:
        rows=[x for x in r['rows'] if band_filter is None or x['band']==band_filter]
        o=order_of(rows)
        if len(o)<3 or len(rows)<3: continue
        x=np.zeros((10,len(feats)));m=np.zeros(10,bool)
        for i,row in enumerate(rows[:10]): x[i]=[row['f'][k] for k in feats]; m[i]=True
        X.append(x);M.append(m);O.append(o[:3])
    return np.array(X),np.array(M),np.array(O)

def pl_negll(beta,X,M,O,lam):
    U=X@beta; U=np.where(M,U,-1e9)
    ll=0.0; G=np.zeros_like(beta); avail=M.copy(); R=np.arange(len(X))
    for k in range(3):
        Ua=np.where(avail,U,-1e9); mx=Ua.max(1,keepdims=True); E=np.exp(Ua-mx)*avail; S=E.sum(1,keepdims=True)
        P=E/S; ch=O[:,k]
        ll+=(U[R,ch]-(mx[:,0]+np.log(S[:,0]))).sum()
        G+=X[R,ch].sum(0)-np.einsum('ri,rif->f',P,X)
        avail[R,ch]=False
    return -ll+lam*beta@beta, -G+2*lam*beta

def fit(X,M,O,lam=LAMBDA):
    b0=np.zeros(X.shape[2]); res=minimize(pl_negll,b0,args=(X,M,O,lam),jac=True,method='L-BFGS-B',options=dict(maxiter=500))
    return res.x

def standardize_stats(rlist,feats,b):
    A=np.array([[x['f'][k] for k in feats] for r in rlist for x in r['rows'] if x['band']==b])
    mu=A.mean(0); sd=A.std(0); sd[sd<1e-9]=1.0; return mu,sd

def months(start='2023-01',end='2026-11'):
    y,m=map(int,start.split('-')); out=[]
    while f'{y:04d}-{m:02d}'<=end: out.append(f'{y:04d}-{m:02d}'); m+=1; y+=m>12; m=1 if m>12 else m
    return out

def walk_forward(fr, feats, only_months=None):
    preds={}; models={}
    for mo in months():
        if only_months and mo not in only_months: continue
        start=mo+'-01'
        train=[r for r in fr if r['date']<start]
        evalr=[r for r in fr if r['date'][:7]==mo]
        if not evalr: continue
        bm={}
        for b in 'YO':
            tr=[r for r in train if r['rtype']=='pure_'+b]
            mu,sd=standardize_stats(tr,feats,b)
            def tx(r,b=b,mu=mu,sd=sd):
                rr=dict(r); rr['rows']=[dict(x,f={k:(x['f'][k]-mu[i])/sd[i] for i,k in enumerate(feats)}) for x in r['rows'] if x['band']==b]; return rr
            X,M,O=pack([tx(r) for r in tr],feats)
            beta=fit(X,M,O); bm[b]=(mu,sd,beta,len(X))
        def util(row):
            mu,sd,beta,_=bm[row['band']]; z=(np.array([row['f'][k] for k in feats])-mu)/sd; return float(z@beta)
        # mixed offset delta on prior mixed races
        mx=[r for r in train if r['rtype']=='mixed']
        Xd=[];Md=[];Od=[]
        for r in mx:
            o=order_of(r['rows'])
            if len(o)<3: continue
            u=np.full(10,0.0);m=np.zeros(10,bool);y=np.zeros(10)
            for i,row in enumerate(r['rows'][:10]): u[i]=util(row);m[i]=True;y[i]=row['band']=='Y'
            Xd.append(np.stack([u,y],1));Md.append(m);Od.append(o[:3])
        Xd=np.array(Xd);Md=np.array(Md);Od=np.array(Od)
        # fix coefficient on own-band utility to 1: optimize delta only
        def nll(d):
            beta=np.array([1.0,d[0]]); v,g=pl_negll(beta,Xd,Md,Od,0.0); return v,np.array([g[1]])
        delta=float(minimize(nll,[0.0],jac=True,method='L-BFGS-B').x[0]) if len(Xd) else 0.0
        models[mo]=dict(delta=delta,n_mixed_train=len(Xd),**{b:dict(n_train=bm[b][3],beta=dict(zip(feats,map(float,bm[b][2]))),mu=list(map(float,bm[b][0])),sd=list(map(float,bm[b][1]))) for b in 'YO'})
        for r in evalr:
            u=np.array([util(x)+(delta if (r['rtype']=='mixed' and x['band']=='Y') else 0.0) for x in r['rows']])
            preds[r['rid']]=u.tolist()
    return preds, models
